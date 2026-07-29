import assert from "node:assert/strict";
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
import { analyzeCase } from "../scripts/lib/eval-corpus/runner.js";
import {
  createRankingTraceCollector,
  EXPECTED_TRACE_STAGES,
  TRACE_LIMITS,
  validateRankingTrace
} from "../scripts/lib/d2e-trace.js";
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
