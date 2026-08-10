import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildPacket,
  validatePacket
} from "../scripts/lib/d2c-packet.js";
import {
  preserveAndUnblind,
  validateCompletedReview,
  validateRetainedPacket
} from "../scripts/lib/d2c-unblind.js";
import {
  repositoryCacheName
} from "../scripts/lib/eval-corpus/checkout.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

test("validated masked bytes are atomically preserved and mechanically unblinded", () => {
  const fixture = makeFixture();
  const built = buildPacket({
    repoRoot: fixture.repoRoot,
    outputRoot: fixture.packetRoot,
    cacheRoot: fixture.cacheRoot
  });
  const template = readJson(
    path.join(fixture.packetRoot, "review-items.json")
  );
  const result = structuredClone(template);
  for (const item of result.items) {
    item.reviewer_disposition = item.path === "x.txt"
      ? "clearly-unsupported"
      : "clearly-defensible-important";
    item.rationale =
      `Direct fixture evidence was reviewed for ${item.path}.`;
    item.source_paths = [item.path];
  }
  const resultBytes = jsonBytes(result);
  fs.writeFileSync(
    path.join(fixture.packetRoot, "output", "review-result.json"),
    resultBytes
  );
  const completedPacket = validatePacket(fixture.packetRoot, {
    allowedOutputFiles: ["review-result.json"]
  });
  const manifest = readJson(
    path.join(fixture.packetRoot, "packet-manifest.json")
  );
  const expected = {
    caseCount: 1,
    corpusManifestSha256:
      manifest.input_commitments.corpus_manifest_sha256,
    itemCount: 2,
    packetHash: built.packet_hash,
    packetManifestSha256: built.packet_manifest_sha256,
    preparationCommit: "c".repeat(40),
    rawReportSha256:
      manifest.input_commitments.raw_report_sha256,
    restoredArtifactSha256:
      manifest.input_commitments.restored_artifact_sha256,
    reviewResultSha256: sha256(resultBytes),
    reviewerPromptSha256: built.reviewer_prompt_sha256
  };

  const staticProof = validateRetainedPacket({
    repoRoot: fixture.repoRoot,
    packetRoot: fixture.packetRoot,
    expected
  });
  assert.equal(staticProof.packet_hash, built.packet_hash);
  assert.deepEqual(staticProof.output_files, ["review-result.json"]);

  const formal = validateCompletedReview({
    repoRoot: fixture.repoRoot,
    packetRoot: fixture.packetRoot,
    expected
  });
  assert.equal(formal.formal_result_valid, true);
  assert.equal(formal.item_count, 2);
  assert.equal(formal.unique_item_count, 2);

  const preserved = preserveAndUnblind({
    repoRoot: fixture.repoRoot,
    packetRoot: fixture.packetRoot,
    expected,
    destinationName: "d2c-unblind-deadbeef"
  });
  assert.equal(
    fs.readFileSync(preserved.preserved_result).equals(resultBytes),
    true
  );
  assert.equal(
    preserved.preserved_result_sha256,
    sha256(resultBytes)
  );
  assert.equal(
    preserved.analysis.method.reviewer_dispositions_modified,
    false
  );
  assert.equal(
    preserved.analysis.method.official_score_recalculated,
    false
  );
  assert.equal(
    preserved.analysis.matrices
      .prediction_only_by_disposition["clearly-unsupported"],
    1
  );
  assert.equal(
    preserved.analysis.matrices
      .label_only_by_disposition["clearly-defensible-important"],
    1
  );
  assert.deepEqual(
    preserved.analysis.items.map((item) => [
      item.path,
      item.origin,
      item.reviewer_disposition
    ]).sort(),
    [
      ["e.txt", "label-only", "clearly-defensible-important"],
      ["x.txt", "prediction-only", "clearly-unsupported"]
    ]
  );
  assert.equal(completedPacket.packet_hash, built.packet_hash);

  assert.throws(
    () => preserveAndUnblind({
      repoRoot: fixture.repoRoot,
      packetRoot: fixture.packetRoot,
      expected,
      destinationName: "d2c-unblind-deadbeef"
    }),
    /already exists/
  );
});

test("formal validation rejects result mutation without partial acceptance", () => {
  const fixture = makeFixture();
  const built = buildPacket({
    repoRoot: fixture.repoRoot,
    outputRoot: fixture.packetRoot,
    cacheRoot: fixture.cacheRoot
  });
  const result = readJson(
    path.join(fixture.packetRoot, "review-items.json")
  );
  for (const item of result.items) {
    item.reviewer_disposition = "unknown";
    item.rationale = "The fixture evidence remains incomplete.";
    item.source_paths = [item.path];
  }
  result.items[0].source_paths = ["outside.txt"];
  const resultBytes = jsonBytes(result);
  fs.writeFileSync(
    path.join(fixture.packetRoot, "output", "review-result.json"),
    resultBytes
  );
  const manifest = readJson(
    path.join(fixture.packetRoot, "packet-manifest.json")
  );
  assert.throws(
    () => validateCompletedReview({
      repoRoot: fixture.repoRoot,
      packetRoot: fixture.packetRoot,
      expected: {
        caseCount: 1,
        corpusManifestSha256:
          manifest.input_commitments.corpus_manifest_sha256,
        itemCount: 2,
        packetHash: built.packet_hash,
        packetManifestSha256: built.packet_manifest_sha256,
        preparationCommit: "c".repeat(40),
        rawReportSha256:
          manifest.input_commitments.raw_report_sha256,
        restoredArtifactSha256:
          manifest.input_commitments.restored_artifact_sha256,
        reviewResultSha256: sha256(resultBytes),
        reviewerPromptSha256: built.reviewer_prompt_sha256
      }
    }),
    /regular contained snapshot file/
  );
  assert.deepEqual(
    fs.readdirSync(path.join(fixture.repoRoot, "eval", "results")),
    ["report.json"]
  );
});

function makeFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-d2c-unblind-test-")
  );
  const repoRoot = path.join(root, "repo");
  const cacheRoot = path.join(root, "cache");
  const packetRoot = path.join(root, "packet");
  fs.mkdirSync(path.join(repoRoot, "eval", "d2c"), {
    recursive: true
  });
  fs.mkdirSync(path.join(repoRoot, "eval", "results"), {
    recursive: true
  });
  fs.mkdirSync(cacheRoot);
  const categories = [
    "python-ml",
    "go-service",
    "monorepo",
    "rust-cli",
    "python-web"
  ];
  const cases = Array.from({ length: 30 }, (_unused, index) => ({
    id: `owner/repo-${String(index).padStart(2, "0")}`,
    category: categories[Math.floor(index / 6)],
    repository:
      `https://github.com/owner/repo-${String(index).padStart(2, "0")}.git`,
    revision: index.toString(16).padStart(40, "0"),
    labels: {
      important_files: ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"]
        .map((file) => ({
          path: file,
          relevance: 3,
          rationale: `Direct fixture evidence supports ${file}.`,
          sources: [file]
        })),
      run: null,
      test: null
    },
    strata: []
  }));
  const corpus = {
    schema_version: 2,
    evaluation_role: "development",
    label_version: "2026-07-29",
    policy: {
      false_positive_cost: 5,
      false_negative_cost: 1,
      important_file_limit: 5,
      minimum_precision: 0.8,
      minimum_recall: 0.6,
      maximum_weighted_error_per_case: 4,
      dimension_thresholds: Object.fromEntries(
        ["important_files", "run_command", "test_command"].map(
          (dimension) => [
            dimension,
            { minimum_precision: 0.8, minimum_recall: 0.6 }
          ]
        )
      ),
      minimum_cases_per_category: 6,
      category_thresholds: Object.fromEntries(
        categories.map((category) => [
          category,
          { minimum_precision: 0.8, minimum_recall: 0.6 }
        ])
      )
    },
    cases,
    release: null
  };
  const corpusBytes = jsonBytes(corpus);
  const corpusHash = sha256(corpusBytes);
  const report = {
    corpus: { manifest_sha256: corpusHash },
    results: cases.map((item, index) => ({
      id: item.id,
      revision: item.revision,
      predictions: {
        important_files: index === 0
          ? ["a.txt", "b.txt", "c.txt", "d.txt", "x.txt"]
          : ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"]
      }
    }))
  };
  const reportBytes = jsonBytes(report);
  const preparation = {
    schema_version: "kanon-d2c-preparation-v1",
    recovery_head: "a".repeat(40),
    restored_artifact_sha256: "b".repeat(64),
    raw_report: "eval/results/report.json",
    raw_report_sha256: sha256(reportBytes),
    corpus_manifest: "eval/corpus.json",
    corpus_manifest_sha256: corpusHash,
    preparation_seed: "31".repeat(32)
  };
  fs.writeFileSync(
    path.join(repoRoot, "eval", "corpus.json"),
    corpusBytes
  );
  fs.writeFileSync(
    path.join(repoRoot, "eval", "results", "report.json"),
    reportBytes
  );
  fs.writeFileSync(
    path.join(repoRoot, "eval", "d2c", "preparation.json"),
    jsonBytes(preparation)
  );
  fs.writeFileSync(
    path.join(repoRoot, "eval", "d2c", "reviewer-prompt.txt"),
    "Synthetic frozen reviewer prompt.\n"
  );
  fs.copyFileSync(
    path.join(
      repositoryRoot,
      "eval",
      "d2c",
      "adjudication.schema.json"
    ),
    path.join(
      repoRoot,
      "eval",
      "d2c",
      "adjudication.schema.json"
    )
  );
  const firstCase = cases[0];
  const cached = path.join(
    cacheRoot,
    repositoryCacheName(firstCase.repository, firstCase.revision)
  );
  fs.mkdirSync(cached);
  for (const file of [
    "a.txt",
    "b.txt",
    "c.txt",
    "d.txt",
    "e.txt",
    "x.txt"
  ]) {
    fs.writeFileSync(path.join(cached, file), `${file}\n`);
  }
  return { root, repoRoot, cacheRoot, packetRoot };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
