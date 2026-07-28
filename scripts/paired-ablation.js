#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateScores,
  loadCorpus,
  scoreCase,
  scoreErrorCase
} from "./lib/eval-corpus.js";
import {
  assertArmIdentityWithheld,
  buildLiveBudgetManifest,
  canonicalJson,
  createBlindedScoringEnvelope,
  createFakeFilesystemProof,
  createPairedSchedule,
  createSyntheticRunRecords,
  loadFrozenPrompt,
  renderRehearsalStatus,
  runPromptInjectionRehearsal,
  scoreBlindedRecords,
  sha256,
  sha256Object,
  unblindPairedScores,
  validateArtifactConformance,
  validateArmIsolation,
  validatePairedConfig,
  validatePairedSchedule,
  validateRunRecords
} from "./lib/paired-ablation.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

try {
  const options = parseArgs(process.argv.slice(2));
  const configDocument = readJsonDocument(
    options.config,
    512 * 1024
  );
  const config = validatePairedConfig(configDocument.value);
  const corpus = loadCorpus(options.corpus);
  const fixtures = readJson(options.fixtures, 512 * 1024);
  const prompt = loadFrozenPrompt(
    path.join(repoRoot, config.prompt.source)
  );
  if (
    prompt.sha256 !== config.prompt.sha256 ||
    prompt.bytes !== config.prompt.bytes
  ) {
    throw new Error("Frozen prompt binding does not match the config.");
  }
  const conformanceDocument = readJsonDocument(
    options.conformanceReport,
    2 * 1024 * 1024
  );
  const conformance = validateArtifactConformance(
    conformanceDocument.value,
    config,
    options.artifactRoot
  );
  const answerSchemaDocument = readJsonDocument(
    options.answerSchema,
    512 * 1024
  );
  if (
    answerSchemaDocument.sha256 !== config.answer_schema.sha256 ||
    answerSchemaDocument.bytes !== config.answer_schema.bytes
  ) {
    throw new Error("Frozen answer-schema binding does not match the config.");
  }
  const scoringEnvelope = createBlindedScoringEnvelope(
    config,
    corpus
  );
  const { schedule, arm_map: initialArmMap } =
    createPairedSchedule(config, corpus);
  const { records, arm_map: populatedArmMap } =
    createSyntheticRunRecords(
      config,
      corpus,
      schedule,
      initialArmMap
    );

  // The scorer receives only the blinded schedule and records. The arm map is
  // supplied later, after this complete score object has been produced.
  assertArmIdentityWithheld(schedule);
  assertArmIdentityWithheld(records);
  assertArmIdentityWithheld(scoringEnvelope);
  const blindedScores = scoreBlindedRecords({
    scoringEnvelope,
    corpus,
    schedule,
    records,
    scoreCase,
    scoreErrorCase
  });
  assertArmIdentityWithheld(blindedScores);

  const armIsolation = validateArmIsolation(
    config,
    populatedArmMap
  );
  const unblinded = unblindPairedScores({
    config,
    corpus,
    schedule,
    armMap: populatedArmMap,
    blindedScores,
    aggregateScores
  });
  const filesystemProof = createFakeFilesystemProof({
    config,
    schedule,
    armMap: populatedArmMap,
    artifactTarball: options.artifactTarball,
    installedArtifactRoot: options.artifactRoot
  });
  const injection = runPromptInjectionRehearsal(fixtures);
  const mutationProofs = exerciseFailureProofs({
    config,
    scoringEnvelope,
    corpus,
    schedule,
    armMap: populatedArmMap,
    records,
    blindedScores
  });
  const liveBudget = buildLiveBudgetManifest(
    config,
    liveControlObservations()
  );
  const report = {
    schema: "kanon-paired-d2a-rehearsal-v1",
    classification:
      "Deterministic synthetic rehearsal; not behavioral evidence.",
    candidate: config.candidate,
    bindings: {
      config_sha256: sha256Object(config),
      config_file_sha256: configDocument.sha256,
      artifact_sha256: config.candidate.artifact_sha256,
      corpus_manifest_sha256: config.corpus.manifest_sha256,
      corpus_revisions_sha256: config.corpus.revisions_sha256,
      frozen_prompt_sha256: config.prompt.sha256,
      scoring_policy_sha256: sha256Object(corpus.policy),
      randomization_seed_commitment_sha256:
        config.randomization.seed_commitment_sha256,
      answer_schema_sha256: answerSchemaDocument.sha256,
      blinded_scoring_envelope_sha256:
        sha256Object(scoringEnvelope),
      conformance_report_sha256:
        conformanceDocument.sha256
    },
    schedule: {
      expected: config.randomization.expected_primary_runs,
      observed: schedule.runs.length,
      repetitions_per_repository: config.randomization.repetitions,
      schedule_sha256: sha256Object(schedule),
      randomized_repository_order: true,
      randomized_arm_order: true,
      opaque_run_ids: true
    },
    blinding: {
      scorer_input_contains_arm_identity: false,
      blinded_scores_sha256: sha256Object(blindedScores),
      arm_map_sha256: sha256Object(populatedArmMap),
      arm_map_applied_after_blinded_scoring: true
    },
    synthetic_execution: {
      record_count: records.length,
      raw_answers_preserved: true,
      execution_complete: unblinded.complete,
      passing: unblinded.passing,
      status_text: renderRehearsalStatus(unblinded),
      expected_failure_modes_present: {
        valid_prediction:
          blindedScores.scored_runs.some(
            (run) => run.output_status === "valid"
          ),
        abstention: records.some((record) =>
          typeof record.raw_answer === "string" &&
          record.raw_answer.includes("\"abstain\"")
        ),
        malformed_json:
          blindedScores.scored_runs.some(
            (run) => run.output_status === "structural-violation"
          ),
        timeout: records.some((record) => record.status === "timeout"),
        analysis_error: records.some(
          (record) => record.status === "analysis-error"
        ),
        structural_output_violation:
          unblinded.execution.structural_violation_count > 0,
        incomplete_execution:
          unblinded.execution.incomplete_attempt_count > 0,
        unsafe_execution_attempt:
          unblinded.execution.safety_failure_count > 0
      }
    },
    filesystem_proof: filesystemProof,
    arm_isolation: armIsolation,
    mutation_proofs: mutationProofs,
    paired_scoring: unblinded,
    prompt_injection: injection,
    live_preflight: liveBudget,
    conformance: {
      passed: conformance.passed,
      check_count: conformance.checks.length,
      artifact_sha256: conformance.artifact_sha256
    },
    harness_validation: {
      valid: Object.values(mutationProofs).every(Boolean),
      live_model_calls: 0,
      synthetic_records: records.length,
      behavioral_claim_supported: false,
      incremental_value_claim_supported: false
    }
  };

  const outputDirectory = prepareOutputDirectory(options.outputDirectory);
  const files = {
    "blinded-scoring-envelope.json": scoringEnvelope,
    "blinded-schedule.json": schedule,
    "raw-records.json": {
      schema: "kanon-paired-raw-record-set-v1",
      schedule_sha256: sha256Object(schedule),
      records
    },
    "blinded-scores.json": blindedScores,
    "arm-map.json": populatedArmMap,
    "injection-rehearsal.json": injection,
    "live-budget.json": liveBudget,
    "rehearsal-report.json": report
  };
  const outputHashes = {};
  for (const [name, value] of Object.entries(files)) {
    outputHashes[name] = writeExclusiveJson(
      path.join(outputDirectory, name),
      value
    );
  }
  process.stdout.write(`${canonicalJson({
    output_directory: outputDirectory,
    report_sha256: outputHashes["rehearsal-report.json"],
    schedule_count: schedule.runs.length,
    synthetic_record_count: records.length,
    harness_valid: report.harness_validation.valid,
    simulated_execution_complete: unblinded.complete,
    live_technically_ready: liveBudget.technically_ready,
    live_model_calls: 0
  })}\n`);
} catch (error) {
  process.stderr.write(
    `Paired-ablation rehearsal error: ${
      error instanceof Error ? error.message : String(error)
    }\n`
  );
  process.exitCode = 1;
}

function parseArgs(argv) {
  const defaults = {
    config: path.join(repoRoot, "eval", "paired-ablation.config.json"),
    corpus: path.join(repoRoot, "eval", "corpus.json"),
    fixtures: path.join(
      repoRoot,
      "eval",
      "fixtures",
      "paired-injection.json"
    ),
    answerSchema: path.join(
      repoRoot,
      "eval",
      "paired-answer.schema.json"
    ),
    artifactTarball: null,
    artifactRoot: null,
    conformanceReport: null,
    outputDirectory: null
  };
  const flags = new Map([
    ["--config", "config"],
    ["--corpus", "corpus"],
    ["--fixtures", "fixtures"],
    ["--answer-schema", "answerSchema"],
    ["--artifact-tarball", "artifactTarball"],
    ["--artifact-root", "artifactRoot"],
    ["--conformance-report", "conformanceReport"],
    ["--output-directory", "outputDirectory"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const field = flags.get(flag);
    if (!field) throw new Error(`Unknown option: ${String(flag)}.`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }
    defaults[field] = path.resolve(value);
    index += 1;
  }
  for (const field of [
    "artifactTarball",
    "artifactRoot",
    "conformanceReport",
    "outputDirectory"
  ]) {
    if (!defaults[field]) {
      throw new Error(`Missing required ${field} option.`);
    }
  }
  return defaults;
}

function exerciseFailureProofs({
  config,
  scoringEnvelope,
  corpus,
  schedule,
  armMap,
  records,
  blindedScores
}) {
  const proof = {
    missing_record_rejected: throws(() =>
      validateRunRecords(
        scoringEnvelope,
        schedule,
        records.slice(0, -1)
      )
    ),
    duplicate_record_rejected: throws(() => {
      const duplicate = structuredClone(records);
      duplicate[0] = structuredClone(duplicate[1]);
      validateRunRecords(scoringEnvelope, schedule, duplicate);
    }),
    omitted_repository_rejected: throws(() => {
      const mutated = structuredClone(schedule);
      mutated.runs = mutated.runs.filter(
        (run) => run.repository_id !== corpus.cases[0].id
      );
      mutated.expected_run_count = mutated.runs.length;
      validatePairedSchedule(config, corpus, mutated, armMap);
    }),
    omitted_arm_rejected: throws(() => {
      const mutated = structuredClone(armMap);
      const first = schedule.runs[0];
      const pair = schedule.runs.find(
        (run) =>
          run.repository_id === first.repository_id &&
          run.repetition === first.repetition &&
          run.run_id !== first.run_id
      );
      const firstEntry = mutated.entries.find(
        (entry) => entry.run_id === first.run_id
      );
      const pairEntry = mutated.entries.find(
        (entry) => entry.run_id === pair.run_id
      );
      pairEntry.arm = firstEntry.arm;
      pairEntry.plain_kanon_inaccessible =
        firstEntry.plain_kanon_inaccessible;
      pairEntry.available_artifact_sha256 =
        firstEntry.available_artifact_sha256;
      validatePairedSchedule(config, corpus, schedule, mutated);
    }),
    omitted_repetition_rejected: throws(() => {
      const mutated = structuredClone(schedule);
      mutated.runs[0].repetition = 2;
      validatePairedSchedule(config, corpus, mutated, armMap);
    }),
    invalid_output_visible:
      blindedScores.execution.structural_violation_count > 0,
    partial_cannot_print_pass: !/\bPASS\b/.test(
      renderRehearsalStatus({
        complete: false,
        passing: false
      })
    ),
    arm_identity_withheld: !throws(() => {
      assertArmIdentityWithheld(schedule);
      assertArmIdentityWithheld(records);
      assertArmIdentityWithheld(blindedScores);
    }),
    plain_isolation_failure_blocks: throws(() => {
      const mutated = structuredClone(armMap);
      const entry = mutated.entries.find((item) => item.arm === "plain");
      entry.plain_kanon_inaccessible = false;
      validateArmIsolation(config, mutated);
    }),
    artifact_mismatch_blocks: throws(() => {
      const mutated = structuredClone(armMap);
      const entry = mutated.entries.find((item) => item.arm === "kanon");
      entry.available_artifact_sha256 = "0".repeat(64);
      validateArmIsolation(config, mutated);
    }),
    unsafe_attempt_is_safety_failure:
      blindedScores.execution.safety_failure_count > 0
  };
  if (!Object.values(proof).every(Boolean)) {
    throw new Error(
      `Deterministic failure proof failed: ${
        Object.entries(proof)
          .filter(([, passed]) => !passed)
          .map(([name]) => name)
          .join(", ")
      }.`
    );
  }
  return proof;
}

function liveControlObservations() {
  const enforceable = (mechanism, limitation = "") => ({
    status: "enforceable",
    mechanism,
    limitation
  });
  const unknown = (mechanism, limitation) => ({
    status: "unknown",
    mechanism,
    limitation
  });
  const unenforceable = (mechanism, limitation) => ({
    status: "unenforceable",
    mechanism,
    limitation
  });
  return {
    trusted_executable: enforceable(
      "Canonical absolute executable resolution rejects repository-contained candidates."
    ),
    version_observed: enforceable(
      "Trusted Codex CLI 0.145.0 returned its version without a model call."
    ),
    fresh_session: enforceable(
      "One new process, runner-owned scratch directory, and --ephemeral per scheduled attempt."
    ),
    model: enforceable("The --model option fixes gpt-5.6-sol."),
    model_snapshot: unknown(
      "The model ID is fixed.",
      "No immutable model snapshot identifier is available to the harness."
    ),
    reasoning: enforceable(
      "A fixed model_reasoning_effort=max config override is passed."
    ),
    wall_clock: enforceable(
      "The parent process applies one non-retrying hard timeout per attempt."
    ),
    filesystem: enforceable(
      "A fresh Git-less checkout and the read-only Codex sandbox bound filesystem mutation."
    ),
    internet: unknown(
      "The read-only Codex sandbox is configured without web search.",
      "D.2A contains no live runtime proof that every internet-capable tool is absent."
    ),
    environment: enforceable(
      "The launcher contract constructs an explicit minimum allowlist and serializes no values."
    ),
    output_schema: enforceable(
      "Codex CLI exposes --output-schema and the harness revalidates exact JSON."
    ),
    raw_answer: enforceable(
      "The harness retains each bounded raw final answer and its SHA-256."
    ),
    instrumentation: unknown(
      "JSON events are requested and bounded fields are validated.",
      "No live D.2A event stream proves token and tool-call fields are always observable."
    ),
    artifact_isolation: unknown(
      "The fake driver proves declared-root isolation.",
      "No documented live mechanism has proven that global Kanon state is inaccessible in plain while only the exact artifact is available in treatment."
    ),
    repository_execution: unenforceable(
      "The prompt forbids execution and the filesystem is read-only.",
      "Codex CLI 0.145.0 exposes a shell-capable read-only sandbox but no enforceable no-repository-execution tool policy."
    ),
    input_tokens: unenforceable(
      "A ceiling is predeclared and measured after the attempt.",
      "Codex CLI 0.145.0 exposes no hard per-run input-token limit."
    ),
    output_tokens: unenforceable(
      "A ceiling is predeclared and the final answer is byte-bounded.",
      "Codex CLI 0.145.0 exposes no hard per-run model-output-token limit."
    ),
    tool_calls: unenforceable(
      "A ceiling is predeclared and calls would be counted from JSON events.",
      "Codex CLI 0.145.0 exposes no hard per-run tool-call limit."
    ),
    disk: unknown(
      "Runner paths are bounded and usage can be measured.",
      "No hard filesystem quota is established for the future live subprocess."
    ),
    driver: unknown(
      "The deterministic planner, validator, scorer, and fake driver are complete.",
      "Live execution is deliberately disabled in D.2A and cannot start while frozen controls remain blocked."
    )
  };
}

function readJson(filePath, maximumBytes) {
  return readJsonDocument(filePath, maximumBytes).value;
}

function readJsonDocument(filePath, maximumBytes) {
  const absolute = path.resolve(filePath);
  const stat = fs.lstatSync(absolute);
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.size > maximumBytes
  ) {
    throw new Error(`Unsafe or oversized JSON input: ${filePath}.`);
  }
  const canonical = fs.realpathSync(absolute);
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  const descriptor = fs.openSync(
    canonical,
    fs.constants.O_RDONLY | noFollow
  );
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.size > maximumBytes) {
      throw new Error(`Unsafe or oversized JSON input: ${filePath}.`);
    }
    const bytes = fs.readFileSync(descriptor);
    return {
      value: JSON.parse(bytes.toString("utf8")),
      sha256: sha256(bytes),
      bytes: bytes.length
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

function prepareOutputDirectory(directory) {
  const lexical = path.resolve(directory);
  const lexicalParent = path.dirname(lexical);
  const parentStat = fs.lstatSync(lexicalParent);
  if (
    parentStat.isSymbolicLink() ||
    !parentStat.isDirectory()
  ) {
    throw new Error("Output parent is unsafe.");
  }
  const parent = fs.realpathSync(lexicalParent);
  const absolute = path.join(parent, path.basename(lexical));
  if (fs.existsSync(absolute)) {
    const stat = fs.lstatSync(absolute);
    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      fs.readdirSync(absolute).length !== 0
    ) {
      throw new Error("Output directory must be absent or empty and real.");
    }
  } else {
    fs.mkdirSync(absolute, { recursive: false, mode: 0o700 });
  }
  return fs.realpathSync(absolute);
}

function writeExclusiveJson(filePath, value) {
  const bytes = `${canonicalJson(value)}\n`;
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return sha256(bytes);
}

function throws(operation) {
  try {
    operation();
    return false;
  } catch {
    return true;
  }
}
