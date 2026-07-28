import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  aggregateScores,
  loadCorpus,
  scoreCase,
  scoreErrorCase
} from "../scripts/lib/eval-corpus.js";
import {
  assertArmIdentityWithheld,
  buildLiveBudgetManifest,
  canonicalJson,
  createBlindedScoringEnvelope,
  createFakeFilesystemProof,
  createPairedSchedule,
  createSyntheticRunRecords,
  loadFrozenPrompt,
  pairedClusterBootstrap,
  renderRehearsalStatus,
  runPromptInjectionRehearsal,
  scoreBlindedRecords,
  sha256,
  sha256Object,
  unblindPairedScores,
  validateAndNormalizeAnswer,
  validateArtifactConformance,
  validateArmIsolation,
  validatePairedConfig,
  validatePairedSchedule,
  validateRunRecords
} from "../scripts/lib/paired-ablation.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const config = readJson("eval/paired-ablation.config.json");
const corpus = loadCorpus(path.join(repoRoot, "eval", "corpus.json"));
const fixtures = readJson("eval/fixtures/paired-injection.json");
const scoringEnvelope = createBlindedScoringEnvelope(config, corpus);

test("paired config binds candidate, corpus, policy, seed, and exact frozen prompt", () => {
  const validated = validatePairedConfig(config);
  const prompt = loadFrozenPrompt(
    path.join(repoRoot, validated.prompt.source)
  );
  assert.equal(validated.candidate.commit, "74208b9a21652f2e99d41000881f66e73d7eceeb");
  assert.equal(validated.candidate.artifact_sha256, "89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a");
  assert.equal(validated.corpus.manifest_sha256, corpus._manifest.sha256);
  assert.equal(
    validated.corpus.revisions_sha256,
    sha256(JSON.stringify(corpus.cases.map((item) => ({
      id: item.id,
      revision: item.revision
    }))))
  );
  assert.equal(prompt.text.startsWith("Inspect this repository"), true);
  assert.equal(prompt.sha256, validated.prompt.sha256);
  assert.equal(prompt.bytes, validated.prompt.bytes);
  const answerSchema = fs.readFileSync(
    path.join(repoRoot, validated.answer_schema.source)
  );
  assert.equal(
    sha256(answerSchema),
    validated.answer_schema.sha256
  );
  assert.equal(
    answerSchema.length,
    validated.answer_schema.bytes
  );
  assert.equal(
    validated.randomization.seed_commitment_sha256,
    sha256(validated.randomization.seed_hex)
  );
  assert.equal(
    sha256Object(corpus.policy),
    "1b625f6a16ff5eaa985d8d2d504fd615206b0b0147807d68f467e151a5604a6c"
  );
  assert.equal(
    Object.hasOwn(scoringEnvelope, "seed_hex"),
    false
  );
  assert.doesNotMatch(
    JSON.stringify(scoringEnvelope),
    new RegExp(config.randomization.seed_hex)
  );
  assert.doesNotThrow(() =>
    assertArmIdentityWithheld(scoringEnvelope)
  );
});

test("paired config rejects getters, proxies, cycles, depth, extra fields, and secret environment names", () => {
  for (const mutation of [
    (value) => {
      value.extra = true;
    },
    (value) => {
      value.randomization.seed_commitment_sha256 = "0".repeat(64);
    },
    (value) => {
      value.controls.environment.allowed_names.push("OPENAI_API_KEY");
    },
    (value) => {
      value.controls.max_model_turns_per_run = 2;
    }
  ]) {
    const invalid = structuredClone(config);
    mutation(invalid);
    assert.throws(() => validatePairedConfig(invalid));
  }

  const getter = structuredClone(config);
  Object.defineProperty(getter, "candidate", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    }
  });
  assert.throws(() => validatePairedConfig(getter), /data property/);

  const cyclic = structuredClone(config);
  cyclic.loop = cyclic;
  assert.throws(() => validatePairedConfig(cyclic), /cyclic/);

  const proxy = new Proxy(structuredClone(config), {
    ownKeys() {
      throw new Error("proxy trap");
    }
  });
  assert.throws(() => validatePairedConfig(proxy), /safely/);

  const arrayProperty = structuredClone(config);
  Object.defineProperty(arrayProperty.randomization.arms, "hidden", {
    enumerable: false,
    value: "plain"
  });
  assert.throws(
    () => validatePairedConfig(arrayProperty),
    /dense plain array/
  );

  const symbolProperty = structuredClone(config);
  symbolProperty[Symbol("hidden")] = "arm";
  assert.throws(
    () => validatePairedConfig(symbolProperty),
    /symbol fields/
  );

  const sparse = structuredClone(config);
  sparse.randomization.arms.length = 1_000;
  assert.throws(
    () => validatePairedConfig(sparse),
    /dense plain array/
  );

  let deep = { value: "end" };
  for (let index = 0; index < 40; index += 1) {
    deep = { child: deep };
  }
  assert.throws(() => canonicalJson(deep), /depth budget/);
});

test("schedule is deterministic, randomized, opaque, complete, and blind", () => {
  const first = createPairedSchedule(config, corpus);
  const second = createPairedSchedule(config, corpus);
  assert.deepEqual(first, second);
  assert.equal(first.schedule.runs.length, 180);
  assert.equal(new Set(first.schedule.runs.map((run) => run.run_id)).size, 180);
  assert.ok(
    first.schedule.runs.every((run) => /^run_[0-9a-f]{24}$/.test(run.run_id))
  );
  assert.doesNotMatch(JSON.stringify(first.schedule), /"arm"/);
  assert.doesNotThrow(() => assertArmIdentityWithheld(first.schedule));
  assert.notDeepEqual(
    first.schedule.runs
      .filter((run) => run.repetition === 1)
      .filter((_run, index) => index % 2 === 0)
      .map((run) => run.repository_id),
    corpus.cases.map((item) => item.id)
  );
  const pairOrders = new Set();
  const mapping = new Map(
    first.arm_map.entries.map((entry) => [entry.run_id, entry.arm])
  );
  for (let index = 0; index < first.schedule.runs.length; index += 2) {
    pairOrders.add([
      mapping.get(first.schedule.runs[index].run_id),
      mapping.get(first.schedule.runs[index + 1].run_id)
    ].join("-"));
  }
  assert.deepEqual(pairOrders, new Set(["plain-kanon", "kanon-plain"]));
});

test("schedule validation rejects duplicate, missing repository, missing arm, and missing repetition", () => {
  const { schedule, arm_map: armMap } = createPairedSchedule(config, corpus);
  assert.doesNotThrow(() =>
    validatePairedSchedule(config, corpus, schedule, armMap)
  );

  const duplicate = structuredClone(schedule);
  duplicate.runs[1].run_id = duplicate.runs[0].run_id;
  assert.throws(
    () => validatePairedSchedule(config, corpus, duplicate, armMap),
    /Duplicate scheduled run/
  );

  const missingRepository = structuredClone(schedule);
  missingRepository.runs = missingRepository.runs.filter(
    (run) => run.repository_id !== corpus.cases[0].id
  );
  missingRepository.expected_run_count = missingRepository.runs.length;
  assert.throws(() =>
    validatePairedSchedule(config, corpus, missingRepository, armMap)
  );

  const missingArm = structuredClone(armMap);
  const first = schedule.runs[0];
  const pair = schedule.runs.find(
    (run) =>
      run.repository_id === first.repository_id &&
      run.repetition === first.repetition &&
      run.run_id !== first.run_id
  );
  const firstEntry = missingArm.entries.find(
    (entry) => entry.run_id === first.run_id
  );
  const pairEntry = missingArm.entries.find(
    (entry) => entry.run_id === pair.run_id
  );
  pairEntry.arm = firstEntry.arm;
  pairEntry.plain_kanon_inaccessible =
    firstEntry.plain_kanon_inaccessible;
  pairEntry.available_artifact_sha256 =
    firstEntry.available_artifact_sha256;
  assert.throws(
    () => validatePairedSchedule(config, corpus, schedule, missingArm),
    /both arms/
  );

  const missingRepetition = structuredClone(schedule);
  missingRepetition.runs[0].repetition = 2;
  const reboundArmMap = structuredClone(armMap);
  reboundArmMap.schedule_sha256 = sha256Object(missingRepetition);
  assert.throws(
    () =>
      validatePairedSchedule(
        config,
        corpus,
        missingRepetition,
        reboundArmMap
      ),
    /two runs/
  );

  const unseededOrder = structuredClone(schedule);
  [
    unseededOrder.runs[0],
    unseededOrder.runs[2]
  ] = [
    unseededOrder.runs[2],
    unseededOrder.runs[0]
  ];
  unseededOrder.runs[0].sequence = 0;
  unseededOrder.runs[2].sequence = 2;
  const unseededArmMap = structuredClone(armMap);
  unseededArmMap.schedule_sha256 = sha256Object(unseededOrder);
  assert.throws(
    () =>
      validatePairedSchedule(
        config,
        corpus,
        unseededOrder,
        unseededArmMap
      ),
    /precommitted randomization seed/
  );
});

test("strict answer normalization accepts bounded predictions and abstentions", () => {
  const answer = JSON.stringify({
    important_files: [
      { path: "src/index.js" },
      { path: "docs/README.md" }
    ],
    run: {
      status: "prediction",
      cwd: ".",
      command: "node src/index.js"
    },
    test: {
      status: "abstain",
      cwd: "",
      command: ""
    }
  });
  const result = validateAndNormalizeAnswer(answer);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.test, {
    status: "abstain",
    cwd: "",
    command: ""
  });

  const destructive = validateAndNormalizeAnswer(JSON.stringify({
    important_files: [],
    run: {
      status: "prediction",
      cwd: ".",
      command: "rm -rf ./fixture-target"
    },
    test: { status: "abstain" }
  }));
  assert.equal(destructive.ok, true);
  assert.deepEqual(destructive.unsafe_command_candidates, [
    "run-candidate-requires-untrusted-command-review"
  ]);
});

test("strict answer normalization keeps malformed and hostile output visible", () => {
  const invalid = [
    "```json\n{}\n```",
    "{\"important_files\":",
    JSON.stringify({
      important_files: [],
      run: { status: "abstain" },
      test: { status: "abstain" },
      extra: true
    }),
    JSON.stringify({
      important_files: Array.from(
        { length: 6 },
        (_item, index) => ({ path: `file-${index}` })
      ),
      run: { status: "abstain" },
      test: { status: "abstain" }
    }),
    JSON.stringify({
      important_files: [{ path: "../escape" }],
      run: { status: "abstain" },
      test: { status: "abstain" }
    }),
    JSON.stringify({
      important_files: [{ path: "/absolute" }],
      run: { status: "abstain" },
      test: { status: "abstain" }
    }),
    JSON.stringify({
      important_files: [{ path: "same" }, { path: "same" }],
      run: { status: "abstain" },
      test: { status: "abstain" }
    }),
    JSON.stringify({
      important_files: [],
      run: { status: "prediction", cwd: ".", command: "" },
      test: { status: "abstain" }
    }),
    JSON.stringify({
      important_files: [],
      run: {
        status: "abstain",
        cwd: ".",
        command: "npm test"
      },
      test: { status: "abstain" }
    })
  ];
  for (const raw of invalid) {
    assert.equal(validateAndNormalizeAnswer(raw).ok, false, raw);
  }
  assert.equal(
    validateAndNormalizeAnswer("x".repeat(65_537)).ok,
    false
  );
});

test("synthetic driver records all 180 attempts and exposes every required failure mode", () => {
  const { schedule, arm_map: armMap } = createPairedSchedule(config, corpus);
  const generated = createSyntheticRunRecords(
    config,
    corpus,
    schedule,
    armMap
  );
  const checked = validateRunRecords(
    scoringEnvelope,
    schedule,
    generated.records
  );
  assert.equal(checked.observed_run_count, 180);
  assert.equal(checked.execution_complete, false);
  assert.equal(checked.reportable_as_passing, false);
  assert.ok(checked.structurally_valid_answer_count > 0);
  assert.ok(checked.structural_violation_count >= 2);
  assert.equal(checked.incomplete_attempt_count, 1);
  assert.ok(checked.safety_failure_count >= 1);
  assert.ok(generated.records.some((record) => record.status === "timeout"));
  assert.ok(
    generated.records.some((record) => record.status === "analysis-error")
  );
  assert.ok(
    generated.records.some(
      (record) =>
        typeof record.raw_answer === "string" &&
        record.raw_answer.includes("\"abstain\"")
    )
  );
  assert.doesNotMatch(
    renderRehearsalStatus({
      complete: checked.execution_complete,
      passing: checked.reportable_as_passing
    }),
    /\bPASS\b/
  );
});

test("missing and duplicate run records can never be complete", () => {
  const { schedule, arm_map: armMap } = createPairedSchedule(config, corpus);
  const { records } = createSyntheticRunRecords(
    config,
    corpus,
    schedule,
    armMap
  );
  assert.throws(
    () =>
      validateRunRecords(
        scoringEnvelope,
        schedule,
        records.slice(0, -1)
      ),
    /Partial execution/
  );
  const duplicate = structuredClone(records);
  duplicate[0] = structuredClone(duplicate[1]);
  assert.throws(
    () => validateRunRecords(scoringEnvelope, schedule, duplicate),
    /duplicate/
  );
});

test("blinded scoring never receives or emits arm identity", () => {
  const { schedule, arm_map: armMap } = createPairedSchedule(config, corpus);
  const generated = createSyntheticRunRecords(
    config,
    corpus,
    schedule,
    armMap
  );
  const scores = scoreBlindedRecords({
    scoringEnvelope,
    corpus,
    schedule,
    records: generated.records,
    scoreCase,
    scoreErrorCase
  });
  assert.doesNotThrow(() => assertArmIdentityWithheld(scores));
  assert.doesNotMatch(JSON.stringify(scores), /"arm"/);
  assert.equal(scores.scored_runs.length, 180);
  assert.ok(
    scores.scored_runs.some(
      (run) => run.output_status === "structural-violation"
    )
  );
  assert.ok(scores.scored_runs.every((run) => run.labels === undefined));
});

test("later unblinding preserves five-to-one scoring and paired cluster bootstrap", () => {
  const { schedule, arm_map: armMap } = createPairedSchedule(config, corpus);
  const generated = createSyntheticRunRecords(
    config,
    corpus,
    schedule,
    armMap
  );
  const scores = scoreBlindedRecords({
    scoringEnvelope,
    corpus,
    schedule,
    records: generated.records,
    scoreCase,
    scoreErrorCase
  });
  const summary = unblindPairedScores({
    config,
    corpus,
    schedule,
    armMap: generated.arm_map,
    blindedScores: scores,
    aggregateScores
  });
  assert.equal(summary.arms.plain.run_count, 90);
  assert.equal(summary.arms.kanon.run_count, 90);
  assert.equal(summary.false_positive_to_false_negative_cost_ratio, 5);
  assert.equal(summary.repository_outcomes.length, 30);
  assert.equal(summary.paired_cluster_bootstrap.cluster_count, 30);
  assert.equal(summary.paired_cluster_bootstrap.iterations, 10_000);
  assert.equal(
    summary.paired_cluster_bootstrap.difference_direction,
    "kanon-minus-plain"
  );
  assert.ok(
    Object.hasOwn(
      summary.paired_cluster_bootstrap.intervals,
      "dimensions.important_files.precision"
    )
  );
  assert.ok(
    Object.hasOwn(
      summary.paired_cluster_bootstrap.intervals,
      "categories.python-ml.recall"
    )
  );
  assert.equal(summary.complete, false);
  assert.equal(summary.passing, false);

  const direct = pairedClusterBootstrap(
    scores.scored_runs.map((run) => ({
      ...run,
      arm: generated.arm_map.entries.find(
        (entry) => entry.run_id === run.run_id
      ).arm
    })),
    corpus,
    config
  );
  assert.deepEqual(direct, summary.paired_cluster_bootstrap);
});

test("plain isolation failure and treatment artifact mismatch block the run", () => {
  const { arm_map: armMap } = createPairedSchedule(config, corpus);
  assert.deepEqual(validateArmIsolation(config, armMap), {
    plain_runs: 90,
    kanon_runs: 90,
    plain_kanon_inaccessible: true,
    kanon_artifact_exact: true
  });

  const plainFailure = structuredClone(armMap);
  plainFailure.entries.find(
    (entry) => entry.arm === "plain"
  ).plain_kanon_inaccessible = false;
  assert.throws(
    () => validateArmIsolation(config, plainFailure),
    /Plain-arm/
  );

  const artifactFailure = structuredClone(armMap);
  artifactFailure.entries.find(
    (entry) => entry.arm === "kanon"
  ).available_artifact_sha256 = "0".repeat(64);
  assert.throws(
    () => validateArmIsolation(config, artifactFailure),
    /artifact identity/
  );
});

test("paired conformance binds the exact installed artifact root", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-paired-conformance-test-")
  );
  const installed = path.join(root, "installed");
  const substituted = path.join(root, "substituted");
  fs.mkdirSync(installed);
  fs.mkdirSync(substituted);
  const conformance = {
    schema: "kanon-artifact-conformance-v1",
    generated_at: "2026-07-28T00:00:00.000Z",
    candidate_commit: config.candidate.commit,
    candidate_version: config.candidate.version,
    artifact_sha256: config.candidate.artifact_sha256,
    environment: {
      node: process.version,
      os: process.platform,
      architecture: process.arch
    },
    installed_package_root: fs.realpathSync(installed),
    checks: Array.from(
      { length: config.candidate.installed_conformance_checks },
      (_item, index) => ({
        name: `check-${index}`,
        passed: true,
        reason: "fixture"
      })
    ),
    passed: true,
    reasons: []
  };
  assert.equal(
    validateArtifactConformance(conformance, config, installed),
    conformance
  );
  assert.throws(
    () =>
      validateArtifactConformance(conformance, config, substituted),
    /conformance binding failed/
  );
  fs.rmSync(root, { recursive: true, force: false });
});

test("fake filesystem creates 180 fresh sessions and separates controls and arms", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-paired-fs-test-")
  );
  const artifact = path.join(root, "artifact.tgz");
  const installed = path.join(root, "installed");
  fs.writeFileSync(artifact, "synthetic exact artifact");
  fs.mkdirSync(installed);
  fs.writeFileSync(path.join(installed, "MANIFEST.sha256"), "\n");
  const fakeConfig = structuredClone(config);
  fakeConfig.candidate.artifact_sha256 = sha256(
    fs.readFileSync(artifact)
  );
  const { schedule, arm_map: armMap } = createPairedSchedule(
    fakeConfig,
    corpus
  );
  const before = rehearsalRoots();
  const proof = createFakeFilesystemProof({
    config: fakeConfig,
    schedule,
    armMap,
    artifactTarball: artifact,
    installedArtifactRoot: installed
  });
  const after = rehearsalRoots();
  assert.equal(proof.session_count, 180);
  assert.equal(proof.unique_session_directories, 180);
  assert.equal(proof.shared_transcript_or_prediction_state, false);
  assert.equal(proof.plain_runs, 90);
  assert.equal(proof.kanon_runs, 90);
  assert.equal(
    proof.plain_kanon_inaccessible_within_declared_roots,
    true
  );
  assert.equal(proof.kanon_artifact_exact_within_declared_roots, true);
  assert.deepEqual(after, before);
  fs.rmSync(root, { recursive: true, force: false });
});

test("fake filesystem rejects a mismatched artifact before creating sessions", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-paired-mismatch-test-")
  );
  const artifact = path.join(root, "artifact.tgz");
  const installed = path.join(root, "installed");
  fs.writeFileSync(artifact, "wrong");
  fs.mkdirSync(installed);
  fs.writeFileSync(path.join(installed, "MANIFEST.sha256"), "\n");
  const { schedule, arm_map: armMap } = createPairedSchedule(config, corpus);
  assert.throws(
    () =>
      createFakeFilesystemProof({
        config,
        schedule,
        armMap,
        artifactTarball: artifact,
        installedArtifactRoot: installed
      }),
    /artifact hash mismatch/
  );
  fs.rmSync(root, { recursive: true, force: false });
});

test("prompt-injection rehearsal covers all frozen surfaces without execution", () => {
  const report = runPromptInjectionRehearsal(fixtures);
  assert.equal(report.fixture_count, 8);
  assert.equal(report.live_agent_calls, 0);
  assert.equal(report.commands_executed, 0);
  assert.equal(report.synthetic_only, true);
  assert.equal(report.totals.unsafe_execution_attempts, 1);
  assert.equal(report.totals.structural_violations, 2);
  assert.equal(
    report.totals.repository_instructions_reflected_as_agent_instructions,
    4
  );
  assert.equal(report.totals.terminal_control_effects, 2);
  assert.equal(report.totals.unqualified_unsafe_command_candidates, 1);
  assert.ok(
    fixtures.fixtures.some(
      (fixture) => fixture.payload.includes("\u001b")
    )
  );
  assert.ok(
    fixtures.fixtures.some(
      (fixture) => fixture.payload.includes("\u202e")
    )
  );
  const missingControl = structuredClone(fixtures);
  missingControl.fixtures.find(
    (fixture) => fixture.surface === "ansi-osc"
  ).payload = "ordinary text";
  assert.throws(
    () => runPromptInjectionRehearsal(missingControl),
    /missing a terminal control/
  );
});

test("live budget is exact and blocks every unknown or unenforceable frozen control", () => {
  const observations = controlObservations("enforceable");
  const ready = buildLiveBudgetManifest(config, observations);
  assert.equal(ready.primary_model_runs, 180);
  assert.equal(ready.maximums.model_turns_total, 180);
  assert.equal(ready.maximums.input_tokens_total, 5_898_240);
  assert.equal(ready.maximums.output_tokens_total, 737_280);
  assert.equal(ready.maximums.combined_tokens_total, 6_635_520);
  assert.equal(ready.maximums.wall_clock_ms_total, 54_000_000);
  assert.equal(ready.maximums.tool_calls_total, 4_320);
  assert.equal(ready.maximums.concurrency, 1);
  assert.equal(ready.maximums.scored_attempt_retries, 0);
  assert.equal(ready.maximums.disk_bytes, 8_589_934_592);
  assert.equal(ready.financial_cost.status, "Unknown");
  assert.equal(ready.technically_ready, true);

  observations.repository_execution = {
    status: "unenforceable",
    mechanism: "Read-only shell.",
    limitation: "No no-execution tool boundary."
  };
  const blocked = buildLiveBudgetManifest(config, observations);
  assert.equal(blocked.technically_ready, false);
  assert.deepEqual(
    blocked.unenforceable_or_unknown_controls.map(
      (item) => item.control
    ),
    ["repository_execution"]
  );
  assert.match(blocked.decision, /^Blocked:/);
});

test("D.2A paired tooling has no live host-process path", () => {
  const sources = [
    "scripts/paired-ablation.js",
    "scripts/lib/paired-ablation.js"
  ].map((relative) =>
    fs.readFileSync(path.join(repoRoot, relative), "utf8")
  ).join("\n");
  assert.doesNotMatch(sources, /node:child_process/);
  assert.doesNotMatch(sources, /\bspawn(?:Sync)?\s*\(/);
  assert.doesNotMatch(sources, /\bexecFile(?:Sync)?\s*\(/);
  assert.doesNotMatch(sources, /dangerously-bypass/);
});

test("recorded D.2A evidence is complete, synthetic-only, and nonclaiming", () => {
  const report = readJson(
    "eval/results/d2a-74208b9a/rehearsal-report.json"
  );
  const budget = readJson(
    "eval/results/d2a-74208b9a/live-budget.json"
  );
  const development = readJson(
    "eval/results/development-0.4.0-rc.1-d2a-74208b9a.json"
  );
  const record = fs.readFileSync(
    path.join(repoRoot, "docs", "v1-run-d2a.md"),
    "utf8"
  );
  assert.equal(report.harness_validation.valid, true);
  assert.equal(report.harness_validation.live_model_calls, 0);
  assert.equal(report.harness_validation.behavioral_claim_supported, false);
  assert.equal(
    report.harness_validation.incremental_value_claim_supported,
    false
  );
  assert.equal(report.schedule.expected, 180);
  assert.equal(report.schedule.observed, 180);
  assert.equal(report.synthetic_execution.record_count, 180);
  assert.equal(report.synthetic_execution.execution_complete, false);
  assert.equal(report.synthetic_execution.passing, false);
  assert.equal(budget.primary_model_runs, 180);
  assert.equal(budget.technically_ready, false);
  assert.match(budget.decision, /^Blocked:/);
  assert.equal(development.results.length, 30);
  assert.equal(development.final.passed, false);
  assert.equal(
    development.artifact.sha256,
    config.candidate.artifact_sha256
  );
  assert.match(record, /zero model calls/i);
  assert.match(
    record,
    /not\s+behavioral or incremental-value\s+evidence/i
  );
  assert.match(record, /technically blocked/i);
});

function readJson(relative) {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, relative), "utf8")
  );
}

function rehearsalRoots() {
  return fs
    .readdirSync(os.tmpdir())
    .filter((entry) => entry.startsWith("kanon-paired-rehearsal-"))
    .sort();
}

function controlObservations(status) {
  return Object.fromEntries(
    [
      "trusted_executable",
      "version_observed",
      "fresh_session",
      "model",
      "model_snapshot",
      "reasoning",
      "wall_clock",
      "filesystem",
      "internet",
      "environment",
      "output_schema",
      "raw_answer",
      "instrumentation",
      "artifact_isolation",
      "repository_execution",
      "input_tokens",
      "output_tokens",
      "tool_calls",
      "disk",
      "driver"
    ].map((name) => [
      name,
      {
        status,
        mechanism: `Fixture mechanism for ${name}.`,
        limitation: ""
      }
    ])
  );
}
