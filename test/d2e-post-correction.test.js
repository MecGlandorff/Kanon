import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { analyzeRepo } from "../src/analyze.js";
import { safeTerminalText } from "../src/trust.js";
import { publicSkillFiles } from "../scripts/lib/artifact-files.js";
import {
  canonicalJson,
  semanticReportProjection,
  sha256
} from "../scripts/lib/d2e-evidence.js";
import {
  buildPostCorrectionComparison,
  classifyCandidateDifference,
  isDeterministicDownstreamDisplacement,
  POST_CORRECTION_CLASSIFICATIONS
} from "../scripts/lib/d2e-post-correction-comparison.js";
import {
  completeTreeCommitment,
  expectedAttemptFiles,
  finalizePostCorrectionTraceAttempt,
  preservePostCorrectionFailure,
  validatePostCorrectionAttempt,
  writePostCorrectionJsonFile
} from "../scripts/lib/d2e-post-correction.js";
import { createRankingTraceCollector } from "../scripts/lib/d2e-trace.js";
import { repositoryCacheName } from "../scripts/lib/eval-corpus/checkout.js";
import { runCorpus } from "../scripts/lib/eval-corpus/runner.js";
import {
  aggregateScores,
  scoreCase
} from "../scripts/lib/eval-corpus/scoring.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const analyzerModule = path.join(repoRoot, "src", "index.js");
const authority = JSON.parse(
  fs.readFileSync(
    path.join(
      repoRoot,
      "eval",
      "d2e",
      "POST_CORRECTION_AUTHORITY.json"
    ),
    "utf8"
  )
);
const policy = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "eval", "corpus.json"), "utf8")
).policy;

test("real runner executes bounded synthetic trace-on and trace-off controls exactly", async () => {
  const cacheRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-post-correction-runner-")
  );
  const repository =
    "https://example.invalid/synthetic/repository.git";
  const revision = "a".repeat(40);
  const cacheName = repositoryCacheName(repository, revision);
  const fixture = path.join(cacheRoot, cacheName);
  fs.mkdirSync(fixture);
  fs.mkdirSync(path.join(fixture, "bin"));
  fs.mkdirSync(path.join(fixture, "lib"));
  fs.writeFileSync(
    path.join(fixture, "README.md"),
    "# Synthetic fixture\n"
  );
  fs.writeFileSync(
    path.join(fixture, "package.json"),
    JSON.stringify({
      bin: { fixture: "./bin/cli.js" },
      exports: { "./declaration": "./lib/declaration.js" },
      name: "synthetic-fixture",
      version: "1.0.0"
    })
  );
  fs.writeFileSync(
    path.join(fixture, "bin", "cli.js"),
    "#!/usr/bin/env node\nconsole.log('fixture');\n"
  );
  fs.writeFileSync(
    path.join(fixture, "lib", "declaration.js"),
    "export const value = 1;\n"
  );
  const traceDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-post-correction-trace-")
  );
  const corpus = {
    _manifest: { sha256: "b".repeat(64) },
    cases: [
      {
        category: "monorepo",
        id: "synthetic/repository",
        labels: {
          important_files: [
            {
              path: "README.md",
              rationale: "synthetic",
              relevance: 3,
              sources: ["README.md"]
            }
          ],
          run: null,
          test: null
        },
        repository,
        revision,
        strata: []
      }
    ],
    evaluation_role: "development",
    label_version: "synthetic",
    policy,
    release: null,
    schema_version: 2
  };
  let consumed = 0;
  let control = null;
  const primary = await runCorpus(corpus, {
    analyzerModule,
    cacheRoot,
    fetch: false,
    onAttemptConsume(value) {
      consumed += 1;
      assert.deepEqual(value, {
        caseOrdinal: 1,
        component: "canonical-d2e-corpus-runner"
      });
    },
    onTraceOffComplete(value) {
      control = value;
    },
    rankingTrace: {
      artifactSha256: "c".repeat(64),
      canonicalSerialization: true,
      corpusSha256: corpus._manifest.sha256,
      exclusiveCreation: true,
      fileNamePrefix: "",
      outputDirectory: traceDirectory,
      protocolSha256: "d".repeat(64),
      traceSourceCommit: "e".repeat(40)
    },
    traceOffControl: true
  });

  assert.equal(consumed, 1);
  assert.ok(control);
  assert.deepEqual(
    semanticReportProjection(primary),
    semanticReportProjection(control)
  );
  assert.deepEqual(fs.readdirSync(traceDirectory), ["001.json"]);
  const traceBytes = fs.readFileSync(
    path.join(traceDirectory, "001.json")
  );
  const trace = JSON.parse(traceBytes);
  assert.equal(
    traceBytes.toString("utf8"),
    `${canonicalJson(trace)}\n`
  );
  const declaration = trace.candidates.find(
    (item) =>
      item.normalized_path === "lib/declaration.js"
  );
  const executable = trace.candidates.find(
    (item) => item.normalized_path === "bin/cli.js"
  );
  assert.ok(
    declaration.curation.visits.some(
      (item) =>
        item.stage === "package-declarations" &&
        item.decision === "selected" &&
        item.heuristic === "manifest-entrypoint"
    )
  );
  assert.ok(
    executable.curation.visits.some(
      (item) => item.stage === "manifest-entrypoints"
    )
  );
});

test("post-correction finalizer emits canonical exact inventory and bounded traces", () => {
  const attemptRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-post-correction-finalizer-")
  );
  const tracesRoot = path.join(attemptRoot, "traces");
  fs.mkdirSync(tracesRoot);
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-post-correction-analysis-")
  );
  fs.mkdirSync(path.join(fixture, "src"));
  fs.writeFileSync(path.join(fixture, "README.md"), "# Fixture\n");
  fs.writeFileSync(
    path.join(fixture, "src", "index.js"),
    "export const value = 1;\n"
  );
  const binding = {
    analysis_schema_sha256: "1".repeat(64),
    artifact_sha256: "2".repeat(64),
    corpus_sha256: "3".repeat(64),
    d2a_report_sha256: "4".repeat(64),
    protocol_sha256: "5".repeat(64),
    source_commit: "6".repeat(40),
    trace_schema_sha256: "7".repeat(64)
  };
  writeCanonical(
    path.join(attemptRoot, "attempt-binding.json"),
    binding
  );
  writeCanonical(
    path.join(attemptRoot, "attempt-consumption.json"),
    {
      attempt_ordinal: 1,
      authority_sha256:
        "b4227670b7b831f1949598add2fa538c875cdb90ab55b1820a35ba81b5543087",
      case_ordinal: 1,
      component: "canonical-d2e-corpus-runner",
      consumed: true,
      pre_attempt_head: binding.source_commit,
      schema: "kanon-d2e-post-correction-consumption-v1"
    }
  );
  const cases = [];
  const receipts = [];
  const results = [];
  for (let index = 0; index < 30; index += 1) {
    const ordinal = index + 1;
    const id = `synthetic/case-${ordinal}`;
    const revision = String(ordinal).padStart(40, "0");
    const traceBinding = {
      artifactSha256: binding.artifact_sha256,
      caseId: id,
      corpusSha256: binding.corpus_sha256,
      ordinal,
      protocolSha256: binding.protocol_sha256,
      revision,
      traceSourceCommit: binding.source_commit
    };
    const collector = createRankingTraceCollector(traceBinding);
    const analysis = analyzeRepo(fixture, {
      _rankingObserver: collector.observer,
      inspectGit: false,
      runId: `synthetic-${ordinal}`,
      scan: { useGitIgnore: false }
    });
    const trace = collector.finalize(analysis);
    const fileName = `${String(ordinal).padStart(3, "0")}.json`;
    const bytes = Buffer.from(`${canonicalJson(trace)}\n`);
    fs.writeFileSync(path.join(tracesRoot, fileName), bytes);
    cases.push({ id, revision });
    receipts.push({
      bytes: bytes.length,
      complete: true,
      file_name: fileName,
      id,
      ordinal,
      revision,
      sha256: sha256(bytes),
      status: "written",
      validation_failures: []
    });
    results.push({
      id,
      predictions: trace.predictions,
      revision
    });
  }
  const primary = {
    ranking_trace: {
      receipts,
      schema: "kanon-d2e-ranking-trace-receipts-v1"
    },
    results,
    summary: { passed: false }
  };
  const control = structuredClone(primary);
  delete control.ranking_trace;
  writeCanonical(path.join(attemptRoot, "raw-report.json"), primary);
  writeCanonical(
    path.join(attemptRoot, "trace-off-report.json"),
    control
  );

  const manifest = finalizePostCorrectionTraceAttempt({
    attempt: { binding, root: attemptRoot },
    corpus: { cases },
    primaryRun: primary,
    traceOffRun: control
  });
  assert.equal(manifest.complete, true);
  assert.equal(manifest.case_count, 30);
  assert.equal(manifest.observer_failure_count, 0);
  assert.equal(manifest.trace_on_off_equivalence.exact, true);
  assert.deepEqual(
    completeTreeCommitment(attemptRoot).files.map(
      (item) => item.path
    ),
    expectedAttemptFiles()
  );
  for (const relative of expectedAttemptFiles()) {
    const bytes = fs.readFileSync(path.join(attemptRoot, relative));
    assert.equal(
      bytes.toString("utf8"),
      `${canonicalJson(JSON.parse(bytes))}\n`,
      relative
    );
  }
});

test("candidate comparator recognizes only the frozen correction boundary and deterministic displacement", () => {
  const fixture = comparisonFixture();
  const direct = classifyCandidateDifference(
    fixture.before.traces[0].candidates[0],
    fixture.attempt.traces[0].candidates[0]
  );
  const displacement = classifyCandidateDifference(
    fixture.before.traces[0].candidates[1],
    fixture.attempt.traces[0].candidates[1]
  );
  assert.equal(
    direct.classification,
    POST_CORRECTION_CLASSIFICATIONS.direct
  );
  assert.equal(
    displacement.classification,
    POST_CORRECTION_CLASSIFICATIONS.displacement
  );
  assert.equal(
    isDeterministicDownstreamDisplacement(
      fixture.before.traces[0].candidates[1],
      fixture.attempt.traces[0].candidates[1]
    ),
    true
  );

  const unexpected = structuredClone(
    fixture.attempt.traces[0].candidates[0]
  );
  unexpected.ranking.score += 1;
  assert.equal(
    classifyCandidateDifference(
      fixture.before.traces[0].candidates[0],
      unexpected
    ).classification,
    POST_CORRECTION_CLASSIFICATIONS.unexpected
  );
  const entrypoint = structuredClone(
    fixture.before.traces[0].candidates[0]
  );
  entrypoint.ranking.signals.push({
    confidence: "known",
    contribution: 1,
    reason: "synthetic entrypoint",
    source: "manifest",
    type: "entrypoint"
  });
  const entrypointAfter = structuredClone(
    fixture.attempt.traces[0].candidates[0]
  );
  entrypointAfter.ranking = structuredClone(entrypoint.ranking);
  assert.equal(
    classifyCandidateDifference(entrypoint, entrypointAfter)
      .classification,
    POST_CORRECTION_CLASSIFICATIONS.unexpected
  );
});

test("all-case comparator supports the authorized effect and serializes every candidate", () => {
  const fixture = comparisonFixture();
  const comparison = buildPostCorrectionComparison(fixture);
  assert.equal(comparison.conclusion, "correction-supported");
  assert.ok(
    comparison.decision_gates.every((item) => item.passed)
  );
  assert.equal(
    comparison.aggregate.counts.direct_authorized_exclusions,
    30
  );
  assert.equal(
    comparison.aggregate.counts
      .deterministic_downstream_displacements,
    30
  );
  assert.equal(
    comparison.aggregate.counts.removed_public_false_positives,
    30
  );
  assert.equal(
    comparison.cases.reduce(
      (total, item) => total + item.candidate_evidence.length,
      0
    ),
    60
  );
  assert.ok(
    Buffer.byteLength(`${canonicalJson(comparison)}\n`) <
      8 * 1024 * 1024
  );
});

test("comparison rejects incomplete input and classifies manifest or intrinsic drift as not supported", () => {
  const incomplete = comparisonFixture();
  incomplete.attempt.traces.pop();
  assert.throws(
    () => buildPostCorrectionComparison(incomplete),
    /comparison-case-inventory/
  );

  const manifestDrift = comparisonFixture();
  manifestDrift.attempt.traces[0].stages[0].selected_on_exit = [
    "unexpected-control"
  ];
  const manifestComparison =
    buildPostCorrectionComparison(manifestDrift);
  assert.equal(
    manifestComparison.conclusion,
    "correction-not-supported"
  );
  assert.equal(manifestComparison.decision_gates[6].passed, false);

  const intrinsicDrift = comparisonFixture();
  intrinsicDrift.attempt.traces[0].candidates[0].ranking.score += 1;
  const intrinsicComparison =
    buildPostCorrectionComparison(intrinsicDrift);
  assert.equal(
    intrinsicComparison.conclusion,
    "correction-not-supported"
  );
  assert.equal(
    intrinsicComparison.aggregate.counts.unexpected_differences,
    1
  );
  assert.equal(intrinsicComparison.decision_gates[7].passed, false);
});

test("failure preservation is additive, byte-exact, bounded, and terminal-safe", () => {
  const fakeRepo = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-post-correction-failure-repo-")
  );
  fs.mkdirSync(path.join(fakeRepo, "eval"));
  fs.mkdirSync(path.join(fakeRepo, "eval", "results"));
  const attemptRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-post-correction-failure-attempt-")
  );
  const bindingBytes = writeCanonical(
    path.join(attemptRoot, "attempt-binding.json"),
    { schema: "synthetic-binding" }
  );
  const consumptionBytes = writeCanonical(
    path.join(attemptRoot, "attempt-consumption.json"),
    { consumed: true }
  );
  const hostile = "failure\u001b]0;title\u0007\nnext\u202E";
  const preserved = preservePostCorrectionFailure({
    attemptRoot,
    error: hostile,
    repoRoot: fakeRepo
  });
  assert.equal(
    fs.readFileSync(
      path.join(preserved.destination, "attempt-binding.json")
    ).equals(bindingBytes),
    true
  );
  assert.equal(
    fs.readFileSync(
      path.join(
        preserved.destination,
        "attempt-consumption.json"
      )
    ).equals(consumptionBytes),
    true
  );
  const failure = JSON.parse(
    fs.readFileSync(
      path.join(preserved.destination, "failure-manifest.json")
    )
  );
  assert.equal(failure.error, safeTerminalText(hostile));
  assert.equal(failure.consumed, true);
  assert.ok(failure.missing.includes("raw-report.json"));
  assert.equal(
    completeTreeCommitment(preserved.destination).sha256,
    preserved.complete_tree_sha256
  );
});

test("attempt validation rejects missing inventory and tree hashing rejects links", () => {
  const incomplete = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-post-correction-incomplete-")
  );
  assert.throws(
    () => validatePostCorrectionAttempt(repoRoot, incomplete),
    /attempt-exact-inventory/
  );
  const linked = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-post-correction-linked-")
  );
  fs.writeFileSync(path.join(linked, "regular.json"), "{}\n");
  fs.symlinkSync(
    path.join(linked, "regular.json"),
    path.join(linked, "linked.json")
  );
  assert.throws(
    () => completeTreeCommitment(linked),
    /tree-link-linked\.json/
  );
});

test("post-correction core serialization is exclusive and path-fixed", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-post-correction-exclusive-")
  );
  writePostCorrectionJsonFile(
    root,
    "attempt-binding.json",
    { finite: 1 }
  );
  const original = fs.readFileSync(
    path.join(root, "attempt-binding.json")
  );
  assert.throws(
    () =>
      writePostCorrectionJsonFile(
        root,
        "attempt-binding.json",
        { finite: 2 }
      ),
    /EEXIST|file already exists/i
  );
  assert.equal(
    fs.readFileSync(
      path.join(root, "attempt-binding.json")
    ).equals(original),
    true
  );
  assert.throws(
    () =>
      writePostCorrectionJsonFile(
        root,
        "../escape.json",
        {}
      ),
    /core-filename/
  );
  assert.throws(
    () =>
      writePostCorrectionJsonFile(
        root,
        "raw-report.json",
        { invalid: Number.POSITIVE_INFINITY }
      ),
    /canonical-finite-number/
  );
});

test("post-correction evaluator and authority remain unshipped", () => {
  const shipped = new Set(publicSkillFiles(repoRoot));
  for (const relative of [
    "eval/d2e/POST_CORRECTION_AUTHORITY.json",
    "scripts/d2e-post-correction.js",
    "scripts/lib/d2e-post-correction.js",
    "scripts/lib/d2e-post-correction-comparison.js"
  ]) {
    assert.equal(shipped.has(relative), false, relative);
  }
});

function comparisonFixture() {
  const beforeTraces = [];
  const afterTraces = [];
  const preResults = [];
  const postResults = [];
  const categories = [
    "go-service",
    "monorepo",
    "python-ml",
    "python-web",
    "rust-cli"
  ];
  for (let index = 0; index < 30; index += 1) {
    const ordinal = index + 1;
    const id = `synthetic/comparison-${ordinal}`;
    const revision = String(ordinal).padStart(40, "0");
    const directPath = `declarations/direct-${ordinal}.js`;
    const displacedPath = `src/displaced-${ordinal}.js`;
    const category = categories[index % categories.length];
    const item = {
      category,
      id,
      labels: {
        important_files: [
          {
            path: displacedPath,
            rationale: "synthetic",
            relevance: 3,
            sources: [displacedPath]
          }
        ],
        run: null,
        test: null
      },
      revision
    };
    const scan = syntheticScan();
    const preAnalysis = {
      state: {
        commands: { run: [], test: [] },
        important_files: [{ path: directPath }],
        scan
      }
    };
    const postAnalysis = {
      state: {
        commands: { run: [], test: [] },
        important_files: [{ path: displacedPath }],
        scan
      }
    };
    preResults.push({
      ...scoreCase(item, preAnalysis, policy),
      analysis_duration_ms: 1
    });
    postResults.push({
      ...scoreCase(item, postAnalysis, policy),
      analysis_duration_ms: 2
    });
    const directId = `candidate-direct-${String(ordinal).padStart(3, "0")}`;
    const displacedId =
      `candidate-displaced-${String(ordinal).padStart(3, "0")}`;
    const preDirect = directCandidate({
      candidateId: directId,
      path: directPath,
      post: false
    });
    const postDirect = directCandidate({
      candidateId: directId,
      path: directPath,
      post: true
    });
    const preDisplaced = displacedCandidate({
      candidateId: displacedId,
      path: displacedPath,
      post: false
    });
    const postDisplaced = displacedCandidate({
      candidateId: displacedId,
      path: displacedPath,
      post: true
    });
    const stages = syntheticStages({
      directId,
      displacedId,
      post: false
    });
    const postStages = syntheticStages({
      directId,
      displacedId,
      post: true
    });
    beforeTraces.push(
      syntheticTrace({
        artifactSha256: "8".repeat(64),
        candidates: [preDirect, preDisplaced],
        id,
        ordinal,
        predictions: {
          important_files: [directPath],
          run: [],
          test: []
        },
        revision,
        sourceCommit: "9".repeat(40),
        stages,
        visitCount: 3
      })
    );
    afterTraces.push(
      syntheticTrace({
        artifactSha256: "a".repeat(64),
        candidates: [postDirect, postDisplaced],
        id,
        ordinal,
        predictions: {
          important_files: [displacedPath],
          run: [],
          test: []
        },
        revision,
        sourceCommit: "b".repeat(40),
        stages: postStages,
        visitCount: 2
      })
    );
  }
  const beforeReport = syntheticReport(preResults);
  const afterReport = syntheticReport(postResults);
  return {
    attempt: {
      binding: { source_commit: "b".repeat(40) },
      consumption: {
        attempt_ordinal: 1,
        case_ordinal: 1,
        component: "canonical-d2e-corpus-runner",
        consumed: true
      },
      inventory: { sha256: "c".repeat(64) },
      manifest: {
        case_count: 30,
        observer_failure_count: 0,
        trace_on_off_equivalence: { exact: true },
        trace_set_sha256: "d".repeat(64)
      },
      report: afterReport,
      traces: afterTraces
    },
    authority,
    before: {
      report: beforeReport,
      trace_set_sha256: "e".repeat(64),
      traces: beforeTraces
    },
    d2a: structuredClone(beforeReport),
    integrity: { passed: true }
  };
}

function directCandidate(input) {
  return {
    candidate_id: input.candidateId,
    curation: {
      deduplicated: false,
      displacement: "not-applicable",
      visits: [
        input.post
          ? {
              cap: null,
              decision: "policy-excluded",
              deduplicated: false,
              displaced_by: null,
              entry_position: 1,
              heuristic: null,
              quota: null,
              reason:
                "package declaration lacks independent salience",
              selected_count_on_entry: 1,
              stage: "package-declarations",
              stage_ordinal: 9
            }
          : {
              cap: null,
              decision: "selected",
              deduplicated: false,
              displaced_by: null,
              entry_position: 1,
              heuristic: "manifest-entrypoint",
              quota: null,
              reason: "manifest-declared package target",
              selected_count_on_entry: 1,
              stage: "package-declarations",
              stage_ordinal: 9
            }
      ]
    },
    discovery_source: "scanner",
    evidence: {
      absent: [],
      present: ["scanner-entry"],
      rejected: [],
      state: "present",
      unknown: []
    },
    final: input.post
      ? {
          rank: null,
          result: "not-selected",
          selected: false,
          selection_heuristic: null,
          selection_reason: null
        }
      : {
          rank: 1,
          result: "selected",
          selected: true,
          selection_heuristic: "manifest-entrypoint",
          selection_reason: "manifest-declared package target"
        },
    normalized_path: input.path,
    ranking: {
      contributions: [
        { name: "signal:declaration", value: 96 }
      ],
      eligibility_reason: "ranking-eligible",
      eligible: true,
      fan_in: 0,
      input_position: 1,
      ranked_position: 1,
      referenced_by: 0,
      score: 96,
      signals: [
        {
          confidence: "known",
          contribution: 96,
          reason: "declared package export",
          source: "manifest",
          type: "declaration"
        }
      ],
      tie_break: {
        fan_in: 0,
        path: input.path,
        score: 96
      }
    }
  };
}

function displacedCandidate(input) {
  const rootVisit = {
    cap: null,
    decision: "selected",
    deduplicated: false,
    displaced_by: null,
    entry_position: 1,
    heuristic: "root-readme",
    quota: 1,
    reason: "root usage contract",
    selected_count_on_entry: 0,
    stage: "root-readme",
    stage_ordinal: 1
  };
  const finalVisit = {
    cap: 5,
    decision: "cap-excluded",
    deduplicated: false,
    displaced_by: input.candidateId,
    entry_position: 2,
    heuristic: "root-readme",
    quota: null,
    reason: "outside final 5-item cap",
    selected_count_on_entry: 2,
    stage: "final-cap",
    stage_ordinal: 15
  };
  return {
    candidate_id: input.candidateId,
    curation: {
      deduplicated: false,
      displacement: input.post ? "not-applicable" : "displaced",
      visits: input.post ? [rootVisit] : [rootVisit, finalVisit]
    },
    discovery_source: "scanner",
    evidence: {
      absent: [],
      present: ["scanner-entry"],
      rejected: [],
      state: "present",
      unknown: []
    },
    final: input.post
      ? {
          rank: 1,
          result: "selected",
          selected: true,
          selection_heuristic: "root-readme",
          selection_reason: "root usage contract"
        }
      : {
          rank: null,
          result: "cap-excluded",
          selected: false,
          selection_heuristic: "root-readme",
          selection_reason: "root usage contract"
        },
    normalized_path: input.path,
    ranking: {
      contributions: [],
      eligibility_reason: "ranking-eligible",
      eligible: true,
      fan_in: 0,
      input_position: 2,
      ranked_position: 2,
      referenced_by: 0,
      score: 0,
      signals: [],
      tie_break: {
        fan_in: 0,
        path: input.path,
        score: 0
      }
    }
  };
}

function syntheticStages(input) {
  return [
    {
      name: "manifest-entrypoints",
      ordering: ["declared:desc"],
      ordinal: 6,
      quota: 1,
      selected_on_entry: [],
      selected_on_exit: []
    },
    {
      name: "package-declarations",
      ordering: ["score:desc"],
      ordinal: 9,
      quota: null,
      selected_on_entry: [input.displacedId],
      selected_on_exit: input.post
        ? [input.displacedId]
        : [input.displacedId, input.directId]
    },
    {
      name: "final-cap",
      ordering: ["curation-order"],
      ordinal: 15,
      quota: 5,
      selected_on_entry: input.post
        ? [input.displacedId]
        : [input.displacedId, input.directId],
      selected_on_exit: input.post
        ? [input.displacedId]
        : [input.directId]
    }
  ];
}

function syntheticTrace(input) {
  return {
    artifact_sha256: input.artifactSha256,
    candidates: input.candidates,
    case: {
      id: input.id,
      ordinal: input.ordinal,
      revision: input.revision
    },
    completeness: {
      checks: [],
      complete: true,
      failures: [],
      observer_failures: 0
    },
    corpus_sha256: "f".repeat(64),
    limits: {
      candidate_count: input.candidates.length,
      serialized_bytes: input.post ? 2 : 1,
      stage_count: input.stages.length,
      stage_visit_count: input.visitCount
    },
    predictions: input.predictions,
    protocol_sha256: "0".repeat(64),
    scan: syntheticScan(),
    schema_version: "kanon-d2e-ranking-trace-v1",
    stages: input.stages,
    trace_source_commit: input.sourceCommit
  };
}

function syntheticReport(results) {
  const summary = aggregateScores(results, policy, {
    expectedCaseCount: 30,
    requireCompleteScans: false
  });
  return {
    analyzer: {
      source: "installed-artifact",
      version: "0.4.0-rc.1"
    },
    artifact: {
      conformance: { applicable: true, passed: true },
      sha256: "1".repeat(64)
    },
    cache_root: "/synthetic",
    candidate: {
      commit: "2".repeat(40),
      version: "0.4.0-rc.1",
      worktree_clean: true
    },
    corpus: {
      evaluation_role: "development",
      label_version: "synthetic",
      manifest_sha256: "3".repeat(64),
      release: null,
      schema_version: 2,
      selected_case_count: 30,
      selected_cases: results.map((item) => item.id),
      total_case_count: 30
    },
    environment: { synthetic: true },
    final: {
      passed: summary.passed,
      reasons: summary.passed
        ? ["All predeclared gates passed."]
        : summary.failures
    },
    generated_at: "2026-07-30T00:00:00.000Z",
    limits: {
      analysis_timeout_ms: 35_000,
      git_output_bytes: 8 * 1024 * 1024,
      git_timeout_ms: 60_000
    },
    results,
    summary
  };
}

function syntheticScan() {
  return {
    budgets_reached: [],
    complete: true,
    max_file_bytes: 1_000_000,
    max_total_text_bytes: 32 * 1024 * 1024,
    outside_root_paths: 0,
    path_failures: [],
    path_failures_truncated: false,
    rejected_paths: 0,
    strategy: "filesystem",
    symlinks_skipped: 0,
    total_text_bytes_read: 1,
    truncated: false,
    unreadable_entries: 0
  };
}

function writeCanonical(filePath, value) {
  const bytes = Buffer.from(`${canonicalJson(value)}\n`);
  fs.writeFileSync(filePath, bytes);
  return bytes;
}
