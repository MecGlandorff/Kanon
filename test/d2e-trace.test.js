import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { analyzeRepo } from "../src/analyze.js";
import { rankImportantFiles } from "../src/code-intel/rank.js";
import { publicSkillFiles } from "../scripts/lib/artifact-files.js";
import {
  compareD2aSemantics,
  validateD2eAnalysis
} from "../scripts/lib/d2e-evidence.js";
import { finalizeTraceAttempt } from "../scripts/lib/d2e-finalize.js";
import { analyzeCase } from "../scripts/lib/eval-corpus/runner.js";
import {
  createRankingTraceCollector,
  EXPECTED_TRACE_STAGES,
  TRACE_LIMITS,
  validateRankingTrace
} from "../scripts/lib/d2e-trace.js";
import {
  safeJsonStringify,
  safeTerminalText
} from "../src/trust.js";
import {
  canSymlink,
  makeFixture,
  writeFixtureFile
} from "./helpers.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const analyzerModule = path.join(repoRoot, "src", "analyze.js");

test("trace-off, trace-on, mutating, and failing observers are semantically equivalent", () => {
  const root = rankingFixture();
  const options = {
    inspectGit: false,
    runId: "d2e-equivalence",
    scan: { useGitIgnore: false }
  };
  const baseline = analyzeRepo(root, options);
  const binding = traceBinding();
  const collector = createRankingTraceCollector(binding);
  const traced = analyzeRepo(root, {
    ...options,
    _rankingObserver: collector.observer
  });
  const mutating = analyzeRepo(root, {
    ...options,
    _rankingObserver(event) {
      event.path = "changed";
      if (Array.isArray(event.signals)) {
        event.signals.length = 0;
      }
      if (Array.isArray(event.selected)) {
        event.selected.reverse();
      }
    }
  });
  const failing = analyzeRepo(root, {
    ...options,
    _rankingObserver() {
      throw new Error("observer failure");
    }
  });

  assert.deepEqual(semanticAnalysis(traced), semanticAnalysis(baseline));
  assert.deepEqual(semanticAnalysis(mutating), semanticAnalysis(baseline));
  assert.deepEqual(semanticAnalysis(failing), semanticAnalysis(baseline));

  const trace = collector.finalize(traced);
  assert.equal(trace.completeness.complete, true);
  assert.deepEqual(validateRankingTrace(trace, binding), {
    valid: true,
    failures: []
  });
});

test("bounded trace covers ordering, ties, stages, dedupe, cap, hostile paths, and incomplete evidence deterministically", () => {
  const root = rankingFixture();
  const binding = traceBinding();
  const firstCollector = createRankingTraceCollector(binding);
  const firstAnalysis = analyzeRepo(root, {
    inspectGit: false,
    runId: "d2e-determinism",
    scan: { useGitIgnore: false },
    _rankingObserver: firstCollector.observer
  });
  const first = firstCollector.finalize(firstAnalysis);
  const secondCollector = createRankingTraceCollector(binding);
  const secondAnalysis = analyzeRepo(root, {
    inspectGit: false,
    runId: "d2e-determinism",
    scan: { useGitIgnore: false },
    _rankingObserver: secondCollector.observer
  });
  const second = secondCollector.finalize(secondAnalysis);

  assert.deepEqual(second, first);
  assert.deepEqual(
    first.stages.map((stage) => stage.name),
    EXPECTED_TRACE_STAGES
  );
  assert.equal(
    first.candidates.length,
    firstAnalysis.inspection.files.length
  );
  assert.deepEqual(
    first.candidates
      .filter((candidate) => candidate.final.selected)
      .sort((left, right) => left.final.rank - right.final.rank)
      .map((candidate) => candidate.normalized_path),
    first.predictions.important_files
  );
  assert.ok(
    first.candidates.some((candidate) =>
      candidate.curation.visits.some(
        (visit) => visit.decision === "duplicate"
      )
    )
  );
  assert.ok(
    first.candidates.some(
      (candidate) => candidate.final.result === "cap-excluded"
    )
  );
  assert.ok(
    first.candidates.some(
      (candidate) =>
        candidate.curation.displacement === "displaced" &&
        candidate.curation.visits.some(
          (visit) => visit.displaced_by !== null
        )
    )
  );
  const tied = ["src/a.js", "src/b.js"].map((candidatePath) =>
    first.candidates.find(
      (candidate) => candidate.normalized_path === candidatePath
    )
  );
  assert.equal(tied[0].ranking.score, tied[1].ranking.score);
  assert.ok(
    tied[0].ranking.ranked_position < tied[1].ranking.ranked_position
  );
  assert.ok(
    first.candidates.some((candidate) =>
      candidate.normalized_path.includes("[U+202E]")
    )
  );
  if (canSymlink()) {
    assert.equal(first.scan.complete, false);
    assert.ok(first.scan.path_failures.length > 0);
    assert.ok(
      first.candidates
        .filter((candidate) => candidate.ranking.eligible)
        .every((candidate) =>
          candidate.evidence.unknown.includes("scan-incomplete")
        )
    );
  }
  assert.ok(first.limits.serialized_bytes <= TRACE_LIMITS.bytesPerCase);
  assert.equal(
    first.limits.serialized_bytes,
    Buffer.byteLength(`${JSON.stringify(first)}\n`)
  );
});

test("D.2A comparator ignores only committed provenance and rejects public semantic drift", () => {
  const baseline = JSON.parse(
    fs.readFileSync(
      path.join(
        repoRoot,
        "eval",
        "results",
        "development-0.4.0-rc.1-d2a-74208b9a.json"
      ),
      "utf8"
    )
  );
  const provenanceOnly = structuredClone(baseline);
  provenanceOnly.generated_at = "variable";
  provenanceOnly.candidate = {
    commit: "f".repeat(40),
    version: "0.4.0-rc.1",
    worktree_clean: true
  };
  provenanceOnly.artifact = { variable: true };
  provenanceOnly.environment = { variable: true };
  provenanceOnly.cache_root = "/variable";
  provenanceOnly.ranking_trace = { variable: true };
  for (const result of provenanceOnly.results) {
    result.analysis_duration_ms += 1;
  }
  assert.equal(
    compareD2aSemantics(provenanceOnly, baseline).passed,
    true
  );

  const mutations = [
    (value) => value.results[0].predictions.important_files.push("drift"),
    (value) => value.results[0].predictions.run.push({
      cwd: ".",
      command: "drift"
    }),
    (value) => {
      value.results[0].abstentions.run_command = false;
    },
    (value) => {
      value.results[0].scan_complete =
        !value.results[0].scan_complete;
    },
    (value) => {
      value.results[0].analysis_error = "drift";
    },
    (value) => {
      value.results[0].category = "drift";
    },
    (value) => {
      value.results[0].totals.fp += 1;
    },
    (value) => {
      value.summary.policy.important_file_limit += 1;
    },
    (value) => {
      value.limits.analysis_timeout_ms += 1;
    },
    (value) => {
      value.final.passed = !value.final.passed;
    }
  ];
  for (const mutate of mutations) {
    const drift = structuredClone(baseline);
    mutate(drift);
    assert.equal(compareD2aSemantics(drift, baseline).passed, false);
  }
});

test("D.2E schemas are valid JSON and evaluator tooling is not shipped", () => {
  for (const relative of [
    "eval/d2e/trace.schema.json",
    "eval/d2e/analysis.schema.json"
  ]) {
    const schema = JSON.parse(
      fs.readFileSync(path.join(repoRoot, relative), "utf8")
    );
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
  }
  const shipped = new Set(publicSkillFiles(repoRoot));
  for (const relative of [
    "scripts/d2e-trace.js",
    "scripts/d2e-conclude.js",
    "scripts/d2e-preserve.js",
    "scripts/lib/d2e-finalize.js",
    "scripts/lib/d2e-trace.js",
    "scripts/lib/d2e-evidence.js",
    "eval/d2e/PROTOCOL.md",
    "eval/d2e/trace.schema.json",
    "eval/d2e/analysis.schema.json"
  ]) {
    assert.equal(shipped.has(relative), false, relative);
  }
});

test("D.2E conclusion validator enforces one governed outcome", () => {
  const unsupported = analysisFixture(false);
  assert.deepEqual(validateD2eAnalysis(unsupported), {
    valid: true,
    failures: []
  });
  const supported = analysisFixture(true);
  assert.deepEqual(validateD2eAnalysis(supported), {
    valid: true,
    failures: []
  });
  for (const mutate of [
    (value) => {
      value.extra = true;
    },
    (value) => {
      value.correction_implemented = true;
    },
    (value) => {
      value.governance.independent_evidence = true;
    },
    (value) => {
      value.bindings.trace_set_sha256 = "invalid";
    },
    (value) => {
      value.preferred_hypothesis = null;
    },
    (value) => {
      value.effects.false_positive_range = [2, 1];
    }
  ]) {
    const invalid = structuredClone(supported);
    mutate(invalid);
    assert.equal(validateD2eAnalysis(invalid).valid, false);
  }
});

test("trace validation rejects extras, malformed bindings, unsafe strings, and count drift", () => {
  const root = rankingFixture();
  const binding = traceBinding();
  const collector = createRankingTraceCollector(binding);
  const trace = collector.finalize(
    analyzeRepo(root, {
      inspectGit: false,
      scan: { useGitIgnore: false },
      _rankingObserver: collector.observer
    })
  );

  for (const mutate of [
    (value) => {
      value.extra = true;
    },
    (value) => {
      value.protocol_sha256 = "0".repeat(64);
    },
    (value) => {
      value.candidates[0].normalized_path = "unsafe\u001b]0;title\u0007";
    },
    (value) => {
      value.limits.candidate_count += 1;
    },
    (value) => {
      value.stages.reverse();
    }
  ]) {
    const invalid = structuredClone(trace);
    mutate(invalid);
    const result = validateRankingTrace(invalid, binding);
    assert.equal(result.valid, false);
    assert.ok(result.failures.length > 0);
  }
});

test("collector bounds excessive candidate detail and hostile generated text", () => {
  const binding = traceBinding();
  const collector = createRankingTraceCollector(binding);
  const candidatePath = "src/bounded.js";
  const signals = Array.from({ length: 65 }, (_, index) => ({
    type: `signal-${index}`,
    reason: `hostile-\u202E-${"x".repeat(1_200)}`,
    score: 1,
    confidence: "known",
    source: "fixture"
  }));
  const ranked = rankImportantFiles(
    [{ path: candidatePath, text: true }],
    {
      signals: new Map([[candidatePath, signals]]),
      importers: new Map(),
      references: new Map()
    },
    { observer: collector.observer }
  );
  const trace = collector.finalize({
    state: {
      important_files: ranked
        .filter((item) => item.recommended)
        .map((item) => ({ path: item.path })),
      commands: { run: [], test: [] }
    },
    inspection: {
      scan: {
        complete: true,
        truncated: false,
        budgets_reached: [],
        path_failures: [],
        path_failures_truncated: false
      }
    }
  });
  const candidate = trace.candidates[0];
  assert.equal(
    candidate.ranking.signals.length,
    TRACE_LIMITS.signalsPerCandidate
  );
  assert.ok(
    candidate.ranking.signals.every(
      (signal) =>
        Buffer.byteLength(signal.reason) <= TRACE_LIMITS.textBytes &&
        !signal.reason.includes("\u202E")
    )
  );
  assert.equal(trace.completeness.complete, false);
  assert.ok(
    trace.completeness.failures.includes("candidate-detail-limit")
  );
  assert.ok(trace.limits.serialized_bytes <= TRACE_LIMITS.bytesPerCase);
});

test("worker trace success or failure cannot alter prediction output", () => {
  const root = rankingFixture();
  const item = {
    id: "fixture/repository",
    revision: "f".repeat(40)
  };
  const plain = analyzeCase(analyzerModule, root, item, 10_000);
  const outputDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-d2e-worker-")
  );
  const binding = {
    ...traceBinding(),
    caseId: item.id,
    revision: item.revision
  };
  const traced = analyzeCase(
    analyzerModule,
    root,
    item,
    10_000,
    {
      output_directory: outputDirectory,
      file_name: "case-001.json",
      binding
    }
  );
  const failed = analyzeCase(
    analyzerModule,
    root,
    item,
    10_000,
    {
      output_directory: path.join(outputDirectory, "missing"),
      file_name: "case-001.json",
      binding
    }
  );

  assert.deepEqual(traced.state, plain.state);
  assert.deepEqual(failed.state, plain.state);
  assert.equal(traced.ranking_trace.status, "written");
  assert.equal(traced.ranking_trace.complete, true);
  assert.equal(failed.ranking_trace.status, "failed");
  assert.equal(failed.ranking_trace.complete, false);
  const persisted = JSON.parse(
    fs.readFileSync(
      path.join(outputDirectory, "case-001.json"),
      "utf8"
    )
  );
  assert.deepEqual(validateRankingTrace(persisted, binding), {
    valid: true,
    failures: []
  });
});

test("top-level D.2E finalization writes the exact safe manifest and rejects a bad receipt binding", () => {
  const binding = {
    source_commit: "a".repeat(40),
    protocol_sha256: "b".repeat(64),
    trace_schema_sha256: "c".repeat(64),
    analysis_schema_sha256: "d".repeat(64),
    corpus_sha256: "e".repeat(64),
    d2a_report_sha256: "f".repeat(64),
    cache_identity_sha256: "1".repeat(64),
    artifact_sha256: "2".repeat(64)
  };
  const hostileId =
    "owner/\u202Erepo\u001b]0;hostile-title\u0007\nnext";

  function prepareAttempt(prefix) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const caseDirectory = path.join(root, "cases");
    fs.mkdirSync(caseDirectory);
    const bindingBytes = `${safeJsonStringify(binding)}\n`;
    const reportBytes = `${safeJsonStringify({
      schema: "synthetic-d2e-report-v1",
      cases: 30
    })}\n`;
    fs.writeFileSync(
      path.join(root, "attempt-binding.json"),
      bindingBytes
    );
    const reportPath = path.join(root, "raw-report.json");
    fs.writeFileSync(reportPath, reportBytes);
    const receipts = [];
    let traceBytes = 0;
    let candidateCount = 0;
    for (let index = 0; index < 30; index += 1) {
      const ordinal = index + 1;
      const fileName =
        `case-${String(ordinal).padStart(3, "0")}.json`;
      const trace = {
        limits: { candidate_count: ordinal },
        completeness: { complete: true }
      };
      const bytes = `${JSON.stringify(trace)}\n`;
      fs.writeFileSync(path.join(caseDirectory, fileName), bytes);
      receipts.push({
        id: index === 0 ? hostileId : `owner/repository-${ordinal}`,
        revision: String(index).padStart(40, "0"),
        ordinal,
        status: "written",
        file_name: fileName,
        sha256: sha256(bytes),
        bytes: Buffer.byteLength(bytes),
        complete: true,
        validation_failures: []
      });
      traceBytes += Buffer.byteLength(bytes);
      candidateCount += ordinal;
    }
    return {
      attempt: { root, caseDirectory, binding },
      reportPath,
      receipts,
      bindingBytes,
      reportBytes,
      traceBytes,
      candidateCount
    };
  }

  const successful = prepareAttempt("kanon-d2e-finalize-success-");
  const manifest = finalizeTraceAttempt(
    successful.attempt,
    { ranking_trace: { receipts: successful.receipts } },
    successful.reportPath
  );
  assert.deepEqual(
    fs.readdirSync(successful.attempt.root).sort(),
    [
      "attempt-binding.json",
      "cases",
      "raw-report.json",
      "trace-manifest.json"
    ]
  );
  assert.deepEqual(
    Object.keys(manifest).sort(),
    [
      "schema",
      "attempt",
      "retries",
      "source_commit",
      "protocol_sha256",
      "trace_schema_sha256",
      "analysis_schema_sha256",
      "corpus_sha256",
      "d2a_report_sha256",
      "cache_identity_sha256",
      "artifact_sha256",
      "attempt_binding_sha256",
      "raw_report_sha256",
      "trace_set_sha256",
      "case_count",
      "candidate_count",
      "trace_bytes",
      "complete",
      "failures",
      "case_files"
    ].sort()
  );
  assert.equal(manifest.schema, "kanon-d2e-trace-manifest-v1");
  assert.equal(manifest.complete, true);
  assert.deepEqual(manifest.failures, []);
  assert.equal(manifest.case_count, 30);
  assert.equal(manifest.candidate_count, successful.candidateCount);
  assert.equal(manifest.trace_bytes, successful.traceBytes);
  assert.equal(
    manifest.attempt_binding_sha256,
    sha256(successful.bindingBytes)
  );
  assert.equal(
    manifest.raw_report_sha256,
    sha256(successful.reportBytes)
  );
  assert.equal(manifest.case_files[0].id, safeTerminalText(hostileId));
  assert.deepEqual(
    manifest.case_files.map((item, index) => ({
      ordinal: item.ordinal,
      file: item.file,
      candidate_count: item.candidate_count,
      complete: item.complete
    })),
    Array.from({ length: 30 }, (_, index) => ({
      ordinal: index + 1,
      file: `cases/case-${String(index + 1).padStart(3, "0")}.json`,
      candidate_count: index + 1,
      complete: true
    }))
  );
  assert.equal(
    manifest.trace_set_sha256,
    sha256(
      JSON.stringify(
        manifest.case_files.map((item) => ({
          ordinal: item.ordinal,
          sha256: item.sha256
        }))
      )
    )
  );
  const persisted = fs.readFileSync(
    path.join(successful.attempt.root, "trace-manifest.json"),
    "utf8"
  );
  assert.equal(persisted, `${safeJsonStringify(manifest)}\n`);
  assert.deepEqual(JSON.parse(persisted), manifest);

  const failed = prepareAttempt("kanon-d2e-finalize-failure-");
  failed.receipts[0].sha256 = "0".repeat(64);
  const rejected = finalizeTraceAttempt(
    failed.attempt,
    { ranking_trace: { receipts: failed.receipts } },
    failed.reportPath
  );
  assert.equal(rejected.complete, false);
  assert.deepEqual(rejected.failures, ["trace-binding-1"]);
  assert.equal(rejected.case_count, 30);
  assert.equal(
    fs.existsSync(
      path.join(failed.attempt.root, "trace-manifest.json")
    ),
    true
  );
});

function rankingFixture() {
  const hostileName = `src/hostile-\u202E-name.js`;
  const longBinary = "x".repeat(180);
  const root = makeFixture({
    "README.md": "# Fixture\n\nRepository data only.\n",
    "package.json": JSON.stringify({
      name: "fixture",
      bin: { [longBinary]: "src/index.js" },
      scripts: {
        start: "node src/index.js",
        test: "node --test"
      }
    }),
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "nx.json": "{}\n",
    "turbo.json": "{}\n",
    "packages/app/package.json": JSON.stringify({
      name: "@fixture/app",
      bin: { app: "src/main.js" }
    }),
    "packages/app/src/main.js":
      "import '../../../src/util.js';\nconsole.log('app');\n",
    "src/index.js":
      "import './util.js';\nconsole.log('fixture');\n",
    "src/other.js": "import './util.js';\n",
    "src/a.js": "export const value = 1;\n",
    "src/b.js": "export const value = 1;\n",
    "src/util.js": "export const utility = true;\n",
    [hostileName]: "export const hostile = true;\n",
    "tests/test_fixture.py": "def test_fixture():\n    assert True\n",
    "assets/image.bin": Buffer.from([0, 1, 2, 3])
  });
  if (canSymlink()) {
    const target = writeFixtureFile(
      root,
      "linked-target.js",
      "export const linked = true;\n"
    );
    fs.symlinkSync(target, path.join(root, "rejected-link.js"));
  }
  return root;
}

function traceBinding() {
  return {
    protocolSha256: "a".repeat(64),
    traceSourceCommit: "b".repeat(40),
    artifactSha256: "c".repeat(64),
    corpusSha256: "d".repeat(64),
    caseId: "fixture/repository",
    revision: "e".repeat(40),
    ordinal: 1
  };
}

function semanticAnalysis(value) {
  const normalized = structuredClone(value);
  delete normalized.state.generated_at;
  delete normalized.state.scan.elapsed_ms;
  delete normalized.inspection.scan.elapsed_ms;
  return normalized;
}

function analysisFixture(supported) {
  const hashBindings = Object.fromEntries(
    [
      "protocol_sha256",
      "trace_schema_sha256",
      "analysis_schema_sha256",
      "corpus_sha256",
      "d2a_report_sha256",
      "cache_identity_sha256",
      "artifact_sha256",
      "conformance_report_sha256",
      "attempt_binding_sha256",
      "raw_report_sha256",
      "trace_set_sha256",
      "equivalence_sha256",
      "mechanism_analysis_sha256"
    ].map((field) => [field, "a".repeat(64)])
  );
  return {
    schema_version: "kanon-d2e-analysis-v1",
    bindings: {
      source_commit: "b".repeat(40),
      ...hashBindings
    },
    disposition: supported
      ? "supported-generic-hypothesis"
      : "no-supported-generic-hypothesis",
    counts: {
      cases: 30,
      candidates: 100,
      eligible_candidates: 90,
      support_candidates: supported ? 3 : 0,
      support_cases: supported ? 3 : 0,
      support_categories: supported ? 2 : 0,
      control_candidates: 3,
      control_cases: 3,
      control_categories: 2,
      counterexamples: 1,
      incomplete_scans: 9
    },
    support: [],
    controls: [],
    counterexamples: [],
    preferred_hypothesis: supported
      ? {
          id: "generic-mechanism",
          production_mechanism: "existing private decision boundary",
          claim: "Generic bounded claim.",
          small_correction: "Adjust one private decision boundary.",
          falsification: "Reject if a control is displaced."
        }
      : null,
    next_correction_boundary: supported
      ? "One private existing decision boundary."
      : null,
    effects: {
      precision_direction: "bounded",
      false_positive_range: [0, 3],
      recall_direction: "bounded",
      true_positive_displacement_range: [0, 3],
      added_false_negative_range: [0, 3],
      displacement_risk: "observed"
    },
    governance: {
      outcome_aware: true,
      independent_evidence: false,
      human_label_governance: "separate-and-blocked",
      next_action: supported
        ? "one-bounded-correction-cycle"
        : "honest-prerelease-or-governance-wait"
    },
    limitations: ["Outcome-aware development evidence."],
    correction_implemented: false
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
