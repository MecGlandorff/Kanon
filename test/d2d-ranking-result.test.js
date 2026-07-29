import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import {
  buildRankingEvidenceManifest,
  parseStrictJson,
  publishGeneratedRankingEvidence,
  readStableRankingResult,
  validateRankingEvidenceManifest,
  validateRankingResultBytes
} from "../scripts/lib/d2d-ranking-result.js";
import { canonicalJson } from "../scripts/lib/d2c-packet.js";

const temporaryRoots = [];

after(() => {
  for (const root of temporaryRoots) {
    makeWritable(root);
    fs.rmSync(root, { recursive: true, force: false });
  }
});

test("strict ranking validation accepts no hypothesis and one to three bounded generic hypotheses", () => {
  const fixture = resultFixture();
  const none = resultBytes({
    schema_version: "kanon-d2d-ranking-result-v1",
    packet_commitment: fixture.packetHash,
    outcome: "no-generic-hypothesis",
    hypotheses: []
  });
  assert.equal(
    validateRankingResultBytes(none, fixture.validation).outcome,
    "no-generic-hypothesis"
  );
  for (const count of [1, 2, 3]) {
    const value = genericResult(fixture, count);
    assert.equal(
      validateRankingResultBytes(
        resultBytes(value),
        fixture.validation
      ).hypotheses.length,
      count
    );
  }
});

test("strict ranking validation rejects malformed, oversized, duplicate, extra, mismatched, unsupported, and specific results", () => {
  const fixture = resultFixture();
  assert.throws(
    () => validateRankingResultBytes(Buffer.from("{"), fixture.validation),
    /strict JSON/
  );
  assert.throws(
    () => validateRankingResultBytes(
      Buffer.alloc(256 * 1024 + 1),
      fixture.validation
    ),
    /oversized/
  );
  assert.throws(
    () => parseStrictJson(
      Buffer.from(
        `{"schema_version":"kanon-d2d-ranking-result-v1",` +
        `"schema_version":"kanon-d2d-ranking-result-v1"}`
      ),
      "ranking result"
    ),
    /duplicate object key/
  );
  assert.throws(
    () => parseStrictJson(
      Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d]),
      "ranking result"
    ),
    /valid UTF-8/
  );

  const extra = genericResult(fixture, 1);
  extra.extra = true;
  assert.throws(
    () => validateRankingResultBytes(
      resultBytes(extra),
      fixture.validation
    ),
    /structure is invalid/
  );
  const mismatch = genericResult(fixture, 1);
  mismatch.packet_commitment = "b".repeat(64);
  assert.throws(
    () => validateRankingResultBytes(
      resultBytes(mismatch),
      fixture.validation
    ),
    /structure is invalid/
  );
  const unsupported = genericResult(fixture, 1);
  unsupported.hypotheses[0].production_signal = "invented-signal";
  assert.throws(
    () => validateRankingResultBytes(
      resultBytes(unsupported),
      fixture.validation
    ),
    /hypothesis structure/
  );
  for (const mechanism of [
    "Prefer candidate-0123456789abcdef01234567.",
    "Prefer docs/internal/example.txt.",
    "Add a repository-specific production rule.",
    "Give React files a higher weight."
  ]) {
    const specific = genericResult(fixture, 1);
    specific.hypotheses[0].generic_mechanism = mechanism;
    assert.throws(
      () => validateRankingResultBytes(
        resultBytes(specific),
        fixture.validation
      ),
      /specific or tuning rule/
    );
  }
  const unsafe = genericResult(fixture, 1);
  unsafe.hypotheses[0].unknowns = ["Unsafe\u001bdisplay"];
  assert.throws(
    () => validateRankingResultBytes(
      resultBytes(unsafe),
      fixture.validation
    ),
    /bounded text list/
  );
});

test("stable ranking-result reads reject links, hard links, mutation, and path replacement races", () => {
  const root = temporaryRoot("kanon-d2d-result-stable-");
  const bytes = Buffer.from("{}\n");
  const direct = path.join(root, "direct.json");
  fs.writeFileSync(direct, bytes);
  assert.ok(readStableRankingResult(direct).equals(bytes));

  const symlink = path.join(root, "symlink.json");
  fs.symlinkSync(direct, symlink);
  assert.throws(
    () => readStableRankingResult(symlink),
    /indirect|special/
  );

  const hard = path.join(root, "hard.json");
  fs.linkSync(direct, hard);
  assert.throws(
    () => readStableRankingResult(direct),
    /hard-linked/
  );
  fs.unlinkSync(hard);

  assert.throws(
    () => readStableRankingResult(direct, {
      afterOpen(file) {
        fs.appendFileSync(file, " ");
      }
    }),
    /changed during/
  );

  fs.writeFileSync(direct, bytes);
  const replacement = path.join(root, "replacement.json");
  fs.writeFileSync(replacement, bytes);
  assert.throws(
    () => readStableRankingResult(direct, {
      afterOpen(file) {
        fs.renameSync(replacement, file);
      }
    }),
    /changed during|path changed/
  );
});

test("canonical evidence generation is byte-identical and publication is atomic, collision-safe, and exact", () => {
  const fixture = publicationFixture("\n");
  const first = fixture.generation;
  const second = structuredCloneGeneration(first);
  const published = publishGeneratedRankingEvidence(first, second);
  assert.equal(
    fs.readFileSync(published.preserved_result).equals(
      first.validated.result_bytes
    ),
    true
  );
  assert.equal(
    fs.readFileSync(published.evidence_manifest).equals(
      first.manifest_bytes
    ),
    true
  );
  assert.equal(
    published.independent_generation_byte_identical,
    true
  );
  assert.equal(validateRankingEvidenceManifest(first.manifest), true);
  assert.throws(
    () => publishGeneratedRankingEvidence(first, second),
    /must not already exist/
  );

  const raced = publicationFixture("\n\n");
  let appeared;
  assert.throws(
    () => publishGeneratedRankingEvidence(
      raced.generation,
      structuredCloneGeneration(raced.generation),
      {
        beforePublish({ destination }) {
          appeared = destination;
          fs.mkdirSync(destination);
          fs.writeFileSync(path.join(destination, "sentinel"), "keep");
        }
      }
    ),
    /appeared before publish/
  );
  assert.equal(
    fs.readFileSync(path.join(appeared, "sentinel"), "utf8"),
    "keep"
  );
  assert.deepEqual(
    fs.readdirSync(path.dirname(appeared)).filter(
      (name) => name.includes(".staging-")
    ),
    []
  );
});

test("evidence manifest binds the unchanged artifact and rejects added or weakened fields", () => {
  const fixture = publicationFixture(" \n");
  const manifest = fixture.generation.manifest;
  assert.equal(validateRankingEvidenceManifest(manifest), true);
  assert.equal(
    manifest.production_artifact_sha256,
    "9".repeat(64)
  );
  const extra = structuredClone(manifest);
  extra.release_authorized = true;
  assert.throws(
    () => validateRankingEvidenceManifest(extra),
    /manifest is invalid/
  );
  const weakened = structuredClone(manifest);
  weakened.controlled_packet_state.unchanged_before_after_parsing = false;
  assert.throws(
    () => validateRankingEvidenceManifest(weakened),
    /manifest is invalid/
  );
});

function resultFixture() {
  const root = temporaryRoot("kanon-d2d-result-fixture-");
  const caseIds = Array.from(
    { length: 28 },
    (_unused, index) => `case-${index.toString(16).padStart(20, "0")}`
  );
  fs.writeFileSync(
    path.join(root, "investigation-cases.json"),
    `${JSON.stringify({ cases: caseIds.map((case_id) => ({ case_id })) })}\n`
  );
  const packetHash = "a".repeat(64);
  return {
    root,
    caseIds,
    packetHash,
    validation: { packet_root: root, packet_hash: packetHash }
  };
}

function genericResult(fixture, count) {
  return {
    schema_version: "kanon-d2d-ranking-result-v1",
    packet_commitment: fixture.packetHash,
    outcome: "generic-hypotheses",
    hypotheses: Array.from(
      { length: count },
      (_unused, index) => ({
        hypothesis_id: `hypothesis-${index + 1}`,
        generic_mechanism:
          "A declaration signal may be overvalued during score aggregation.",
        production_signal: "manifest-declaration-signal",
        selection_stage: "rank-score-aggregation",
        supporting_case_ids: [
          fixture.caseIds[index * 5],
          fixture.caseIds[index * 5 + 1]
        ],
        counterexample_case_ids: [fixture.caseIds[index * 5 + 2]],
        control_case_ids: [
          fixture.caseIds[index * 5 + 3],
          fixture.caseIds[index * 5 + 4]
        ],
        falsifying_evidence:
          "Multiple controls retaining the same order after isolation would falsify the mechanism.",
        expected_direction: {
          precision: "no-clear-direction",
          recall: "increase"
        },
        regression_risks: [
          "Contract evidence could be underrepresented."
        ],
        smallest_generic_experiment:
          "Run a paired generic ablation that removes only this signal.",
        unknowns: [
          "Per-candidate production traces are unavailable."
        ]
      })
    )
  };
}

function publicationFixture(suffix) {
  const repoRoot = temporaryRoot("kanon-d2d-publish-");
  fs.mkdirSync(path.join(repoRoot, "eval"));
  fs.mkdirSync(path.join(repoRoot, "eval", "results"));
  const result = Buffer.from(
    `${JSON.stringify({
      schema_version: "kanon-d2d-ranking-result-v1",
      packet_commitment: "a".repeat(64),
      outcome: "no-generic-hypothesis",
      hypotheses: []
    })}${suffix}`
  );
  const resultHash = digest(result);
  const expected = {
    preparationCommit: "1".repeat(40),
    packetHash: "a".repeat(64),
    packetManifestSha256: "2".repeat(64),
    snapshotTreeSha256: "3".repeat(64),
    productionSourceSha256: "4".repeat(64),
    reviewerPromptSha256: "5".repeat(64),
    resultSchemaSha256: "6".repeat(64),
    caseCount: 28,
    candidateCount: 185,
    productionArtifactSha256: "9".repeat(64)
  };
  const validated = {
    static_packet: {
      packet_hash: expected.packetHash,
      packet_manifest_sha256: expected.packetManifestSha256,
      snapshot_tree_sha256: expected.snapshotTreeSha256,
      production_source_sha256: expected.productionSourceSha256,
      case_count: 28,
      candidate_count: 185
    },
    controlled_state_sha256: "7".repeat(64),
    controlled_inputs_unchanged: true,
    schema_version: "kanon-d2d-ranking-result-v1",
    reviewer_outcome: "no-generic-hypothesis",
    hypothesis_count: 0,
    result_sha256: resultHash,
    result_bytes: result
  };
  const destinationName = `d2d-ranking-${resultHash.slice(0, 8)}`;
  const manifest = buildRankingEvidenceManifest({
    expected,
    validated,
    preservedResultPath:
      `eval/results/${destinationName}/ranking-result.json`
  });
  return {
    generation: {
      repo_root: repoRoot,
      destination_name: destinationName,
      validated,
      manifest,
      manifest_bytes: Buffer.from(`${canonicalJson(manifest)}\n`)
    }
  };
}

function structuredCloneGeneration(value) {
  return {
    ...value,
    validated: {
      ...value.validated,
      result_bytes: Buffer.from(value.validated.result_bytes)
    },
    manifest: structuredClone(value.manifest),
    manifest_bytes: Buffer.from(value.manifest_bytes)
  };
}

function resultBytes(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`);
}

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function temporaryRoot(prefix) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temporaryRoots.push(root);
  return root;
}

function makeWritable(root) {
  if (!fs.existsSync(root)) {
    return;
  }
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    const stat = fs.lstatSync(current);
    if (stat.isDirectory()) {
      fs.chmodSync(current, 0o700);
      for (const name of fs.readdirSync(current)) {
        pending.push(path.join(current, name));
      }
    } else if (stat.isFile()) {
      fs.chmodSync(current, 0o600);
    }
  }
}
