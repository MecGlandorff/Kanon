import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES,
  expandSyntheticPopulation,
  loadSyntheticPopulation,
  processSyntheticFixture
} from "../eval/v1.0.0-simulation/lib/fixtures.js";
import {
  buildAccessEnvelopes,
  deterministicSelection,
  measureAgreement
} from "../eval/v1.0.0-simulation/lib/tabletop.js";
import {
  CLASSIFICATION,
  ORDERING,
  PACKAGE_VERSION,
  PERSONAS,
  PRODUCTION_ARTIFACT_SHA256,
  artifactEnvelope,
  assertCandidateBaseline,
  canonicalBytes,
  canonicalJson,
  completeTreeCommitment,
  consumePseudoAttempt,
  loadCanonicalJson,
  preserveSimulationFailure,
  sha256,
  validateAccessLedger,
  validateArtifact,
  validateClassification,
  validateConclusion,
  validateOrdering,
  validatePersonaDeclarations,
  validateSimulationPath,
  validateSimulationProtocol,
  validateSyntheticFixture,
  writeCanonicalExclusive
} from "../eval/v1.0.0-simulation/lib/validator.js";
import { publicSkillFiles } from "../scripts/lib/artifact-files.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const simulationRoot = path.join(
  repoRoot,
  "eval",
  "v1.0.0-simulation"
);
const protocolPath = path.join(simulationRoot, "PROTOCOL.json");
const populationPath = path.join(
  simulationRoot,
  "fixtures",
  "population.json"
);
const protocol = loadCanonicalJson(protocolPath);
const population = loadSyntheticPopulation(populationPath);
const bindings = {
  prospective_protocol_sha256: hash("1"),
  simulation_implementation_sha256: hash("2"),
  simulation_population_sha256: hash("3"),
  simulation_protocol_sha256: protocol.sha256,
  simulation_specification_sha256: hash("4")
};

test("simulation protocol is canonical, classified, reduced, and prospective-inactive", () => {
  assert.equal(validateSimulationProtocol(protocol.value), true);
  assert.equal(
    fs.readFileSync(protocolPath, "utf8"),
    `${canonicalJson(protocol.value)}\n`
  );
  assert.equal(protocol.value.design.development_total, 10);
  assert.equal(protocol.value.design.pseudo_holdout_total, 10);
  assert.equal(
    protocol.value.design.prospective_sample_requirement_satisfied,
    false
  );
  assert.equal(protocol.value.prospective_protocol_activated, false);
});

test("mandatory simulation classification rejects missing and contradictory fields", () => {
  assert.equal(validateClassification(CLASSIFICATION), true);
  for (const [key, contradictory] of [
    ["evidence_classification", "release-evidence"],
    ["human_independence", true],
    ["prospective_protocol_activated", true],
    ["release_authority", true],
    ["simulation", false]
  ]) {
    const value = { ...CLASSIFICATION, [key]: contradictory };
    assert.throws(
      () => validateClassification(value),
      new RegExp(`classification-${key}`)
    );
  }
  const missing = { ...CLASSIFICATION };
  delete missing.simulation;
  assert.throws(
    () => validateClassification(missing),
    /classification-simulation/
  );
});

test("simulation namespace containment rejects historical, prospective, and escaped paths", () => {
  assert.equal(
    validateSimulationPath(
      "eval/v1.0.0-simulation/evidence-sha256-a/record.json"
    ),
    true
  );
  for (const relative of [
    "eval/v1.0.0-prospective/simulation.json",
    "eval/results/simulation.json",
    "eval/d2e/simulation.json",
    "eval/v1.0.0-simulation/../results/escape.json",
    "/eval/v1.0.0-simulation/absolute.json"
  ]) {
    assert.throws(
      () => validateSimulationPath(relative),
      /simulation-namespace-containment/,
      relative
    );
  }
});

test("deterministic population has five structural categories and exact 10/10 fixture commitments", () => {
  const first = expandSyntheticPopulation(population.value);
  const second = expandSyntheticPopulation(population.value);
  assert.deepEqual(first, second);
  assert.equal(first.length, 20);
  assert.equal(
    first.filter(
      (item) => item.fixture.partition === "synthetic-development"
    ).length,
    10
  );
  assert.equal(
    first.filter(
      (item) => item.fixture.partition === "synthetic-pseudo-holdout"
    ).length,
    10
  );
  assert.deepEqual(
    new Set(first.map((item) => item.fixture.category)),
    new Set(CATEGORIES.map((item) => item.id))
  );
  assert.equal(
    new Set(first.map((item) => item.fixture_sha256)).size,
    20
  );
});

test("all six persona records disclose simulation and deny human independence", () => {
  const declarations = PERSONAS.map((personaId) => ({
    blindness_proof_claim: false,
    controlled_by: "one-user-and-agent-system",
    human: false,
    human_attestation: false,
    independence_claim: false,
    persona_id: personaId,
    procedural_role: `simulated role ${personaId}`,
    simulated: true
  }));
  assert.equal(validatePersonaDeclarations(declarations), true);
  const humanClaim = structuredClone(declarations);
  humanClaim[0].human = true;
  assert.throws(
    () => validatePersonaDeclarations(humanClaim),
    /simulation-disclosure/
  );
});

test("canonical access envelopes enforce each persona input allowlist", () => {
  const envelopes = buildAccessEnvelopes();
  const co = envelopes.find((item) => item.persona_id === "SIM-CO");
  const entry = {
    envelope_sha256: sha256(canonicalBytes(co)),
    inputs: [
      {
        kind: "simulation-specification",
        sha256: hash("a")
      }
    ],
    ledger_sequence: 1,
    persona_id: "SIM-CO",
    role_execution_sequence: 1
  };
  assert.equal(validateAccessLedger([entry], envelopes), true);
  const forbidden = structuredClone(entry);
  forbidden.inputs[0].kind = "pseudo-fixture-content-before-freeze";
  assert.throws(
    () => validateAccessLedger([forbidden], envelopes),
    /access-envelope-enforcement-SIM-CO/
  );
});

test("labeler cross-access is rejected before raw-label finalization", () => {
  const envelopes = buildAccessEnvelopes();
  const lb = envelopes.find((item) => item.persona_id === "SIM-LB");
  const entry = {
    envelope_sha256: sha256(canonicalBytes(lb)),
    inputs: [
      {
        kind: "raw-labels-a",
        sha256: hash("a")
      }
    ],
    ledger_sequence: 1,
    persona_id: "SIM-LB",
    role_execution_sequence: 8
  };
  assert.throws(
    () => validateAccessLedger([entry], envelopes),
    /access-envelope-enforcement-SIM-LB/
  );
});

test("exact tabletop ordering contains all 18 required steps", () => {
  const events = orderingEvents();
  assert.equal(validateOrdering(events), true);
  assert.equal(events.length, 18);
});

test("labels must freeze before prediction finalization or unblinding", () => {
  const events = orderingEvents();
  const finalLabels = events.find(
    (item) => item.type === "freeze-final-simulated-labels"
  );
  const unblind = events.find(
    (item) => item.type === "unblind-simulated-predictions"
  );
  [finalLabels.type, unblind.type] = [unblind.type, finalLabels.type];
  assert.throws(
    () => validateOrdering(events),
    /ordering-exact-sequence|must-precede/
  );
});

test("candidate freeze must precede durable pseudo-attempt consumption", () => {
  const events = orderingEvents();
  const candidate = events.find(
    (item) => item.type === "freeze-unchanged-baseline-candidate"
  );
  const receipt = events.find(
    (item) => item.type === "durably-consume-exactly-one-pseudo-attempt"
  );
  [candidate.type, receipt.type] = [receipt.type, candidate.type];
  assert.throws(
    () => validateOrdering(events),
    /ordering-exact-sequence|must-precede/
  );
});

test("both entropy commitments must precede deterministic ordering", () => {
  const events = orderingEvents();
  const entropy = events.find(
    (item) =>
      item.type ===
      "commit-and-reveal-sim-ce-and-sim-ro-entropy"
  );
  const selection = events.find(
    (item) =>
      item.type ===
      "deterministically-select-development-and-pseudo-holdout"
  );
  [entropy.type, selection.type] = [selection.type, entropy.type];
  assert.throws(
    () => validateOrdering(events),
    /ordering-exact-sequence|must-precede/
  );
});

test("exactly one durable pseudo-attempt receipt is accepted and a retry is rejected", () => {
  const receipt = receiptFixture();
  const consumed = consumePseudoAttempt(
    { authorized: true, consumed_count: 0 },
    receipt
  );
  assert.equal(consumed.consumed_count, 1);
  assert.throws(
    () => consumePseudoAttempt(consumed, receipt),
    /one-durable-pseudo-attempt/
  );

  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-simulation-durable-")
  );
  try {
    const artifact = artifactEnvelope({
      artifactType: "pseudo-attempt-consumption",
      bindings,
      payload: { receipt },
      producer: "SIM-CE",
      sequence: 13
    });
    executeFrozenDurableWrite(() =>
      writeCanonicalExclusive(root, "attempt.json", artifact, {
        durable: true
      })
    );
    assert.deepEqual(
      loadCanonicalJson(path.join(root, "attempt.json")).value,
      artifact
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: false });
  }
});

test("post-consumption mutation evidence is rejected", () => {
  const events = orderingEvents();
  events[13].mutation_after_consumption = true;
  assert.throws(
    () => validateOrdering(events),
    /ordering-event-fields/
  );
});

test("failure preservation is additive and leaves prior bytes unchanged", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-simulation-failure-")
  );
  try {
    const original = artifactEnvelope({
      artifactType: "synthetic-preflight",
      bindings,
      payload: { preflight_identity: hash("9") },
      producer: "SIM-CE",
      sequence: 1
    });
    const written = writeCanonicalExclusive(
      root,
      "original.json",
      original
    );
    const before = fs.readFileSync(written.path);
    const beforeTree = completeTreeCommitment(root);
    const preservation = executeFrozenDurableWrite(() =>
      preserveSimulationFailure({
        bindings,
        error: "synthetic preflight failure",
        root,
        sequence: 18
      })
    );
    const afterTree = completeTreeCommitment(root);
    assert.equal(
      fs.readFileSync(written.path).equals(before),
      true
    );
    assert.equal(beforeTree.files.length, 1);
    assert.equal(afterTree.files.length, 2);
    const failure = loadCanonicalJson(
      path.join(root, "failure-manifest.json")
    ).value;
    assert.equal(
      failure.payload.prior_tree_sha256,
      beforeTree.sha256
    );
    assert.equal(failure.payload.retry_permitted, false);
    if (!preservation.directorySyncUnsupported) {
      assert.deepEqual(preservation.result.before, beforeTree);
      assert.deepEqual(preservation.result.after, afterTree);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: false });
  }
});

test("permitted conclusions are simulation-only", () => {
  for (const conclusion of [
    "simulation-complete",
    "simulation-failed",
    "simulation-inconclusive",
    "simulation-invalid"
  ]) {
    assert.equal(validateConclusion(conclusion), conclusion);
  }
  for (const conclusion of [
    "release-supported",
    "release-not-supported",
    "inconclusive"
  ]) {
    assert.throws(
      () => validateConclusion(conclusion),
      /conclusion-restriction/
    );
  }
});

test("candidate binding requires the unchanged production artifact, version, and zero runtime dependencies", () => {
  const candidate = {
    package_version: PACKAGE_VERSION,
    production_artifact_sha256: PRODUCTION_ARTIFACT_SHA256,
    production_change_allowed: false,
    runtime_dependency_count: 0,
    source_commit: "a".repeat(40)
  };
  assert.equal(assertCandidateBaseline(candidate), true);
  for (const mutation of [
    { production_artifact_sha256: hash("b") },
    { package_version: "1.0.0" },
    { runtime_dependency_count: 1 },
    { production_change_allowed: true }
  ]) {
    assert.throws(
      () => assertCandidateBaseline({ ...candidate, ...mutation }),
      /unchanged-production-artifact-binding/
    );
  }
});

test("real-looking repository identities and network-derived fixture metadata are rejected", () => {
  const fixture = expandSyntheticPopulation(population.value)[0].fixture;
  assert.equal(validateSyntheticFixture(fixture), true);
  const repositoryIdentity = {
    ...fixture,
    repository_url: "https://example.invalid/owner/project"
  };
  assert.throws(
    () => validateSyntheticFixture(repositoryIdentity),
    /synthetic fixture-keys|real-repository-field/
  );
  const networkContent = structuredClone(fixture);
  networkContent.files["README.md"] =
    "Fetched from https://example.invalid/project";
  assert.throws(
    () => validateSyntheticFixture(networkContent),
    /synthetic-fixture-material/
  );
});

test("artifact validator rejects release claims, human attestations, and unbound records", () => {
  const releaseClaim = artifactEnvelope({
    artifactType: "synthetic-preflight",
    bindings,
    payload: { conclusion: "simulation-complete" },
    producer: "SIM-RO",
    sequence: 18
  });
  releaseClaim.payload.conclusion = "release-supported";
  assert.throws(
    () => validateArtifact(releaseClaim),
    /release-conclusion-claim/
  );

  const humanClaim = structuredClone(releaseClaim);
  humanClaim.payload.conclusion = "simulation-complete";
  humanClaim.payload.human_attestation = true;
  assert.throws(
    () => validateArtifact(humanClaim),
    /prohibited-claim-human_attestation/
  );

  const unbound = artifactEnvelope({
    artifactType: "synthetic-preflight",
    bindings,
    payload: {},
    producer: "SIM-CE",
    sequence: 1
  });
  unbound.bindings = {};
  assert.throws(
    () => validateArtifact(unbound),
    /artifact-bindings/
  );
});

test("deterministic selection and simulated raw-label agreement are stable", () => {
  const expanded = expandSyntheticPopulation(population.value);
  const first = deterministicSelection(expanded, hash("a"));
  const second = deterministicSelection(expanded, hash("a"));
  assert.deepEqual(first, second);
  assert.equal(first.development.length, 10);
  assert.equal(first.pseudoHoldout.length, 10);

  const labelsA = rawLabels(first.pseudoHoldout);
  const labelsB = structuredClone(labelsA);
  const alternate = Object.keys(first.pseudoHoldout[0].fixture.files).find(
    (relative) =>
      !labelsB[0].labels.important_files.includes(relative)
  );
  labelsB[0].labels.important_files[4] = alternate;
  const agreement = measureAgreement(labelsA, labelsB);
  assert.equal(agreement.passed, true);
  assert.equal(agreement.important_file_micro_jaccard, 49 / 51);
  assert.equal(agreement.run_command_exact_agreement, 1);
  assert.equal(agreement.test_command_exact_agreement, 1);
});

test("development preflight processes one generated fixture without Git, network, or real corpus access", () => {
  const fixture = expandSyntheticPopulation(population.value).find(
    (item) =>
      item.fixture.partition === "synthetic-development"
  ).fixture;
  const result = processSyntheticFixture(fixture, { trace: true });
  assert.ok(Array.isArray(result.predictions.important_files));
  assert.equal(result.trace.complete, true);
  assert.equal(result.trace.observer_failure_count, 0);
  assert.match(result.trace.event_sha256, /^[0-9a-f]{64}$/);
});

test("simulation implementation and evidence namespace remain outside the production allowlist", () => {
  const shipped = new Set(publicSkillFiles(repoRoot));
  for (const relative of [
    "eval/v1.0.0-simulation/PROTOCOL.json",
    "eval/v1.0.0-simulation/artifact.schema.json",
    "eval/v1.0.0-simulation/fixtures/population.json",
    "eval/v1.0.0-simulation/lib/fixtures.js",
    "eval/v1.0.0-simulation/lib/tabletop.js",
    "eval/v1.0.0-simulation/lib/validator.js",
    "eval/v1.0.0-simulation/protocol.schema.json",
    "test/v1-simulation.test.js"
  ]) {
    assert.equal(shipped.has(relative), false, relative);
  }
});

test("canonical tree commitment rejects linked evidence and binds exact bytes", (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-simulation-tree-")
  );
  try {
    fs.writeFileSync(path.join(root, "one.json"), "{}\n");
    const first = completeTreeCommitment(root);
    const second = completeTreeCommitment(root);
    assert.deepEqual(first, second);
    try {
      fs.symlinkSync(
        path.join(root, "one.json"),
        path.join(root, "link.json")
      );
    } catch {
      t.skip("Symbolic links are unavailable.");
      return;
    }
    assert.throws(
      () => completeTreeCommitment(root),
      /tree-link-link\.json/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: false });
  }
});

function orderingEvents() {
  return ORDERING.map((type, index) => ({
    mutation_after_consumption: false,
    output_commitment_sha256: hash(
      ((index + 1) % 10).toString(16)
    ),
    sequence: index + 1,
    type
  }));
}

function receiptFixture() {
  return {
    attempt_ordinal: 1,
    candidate_freeze_sha256: hash("a"),
    case_ordinal: 1,
    component: "canonical-simulation-pseudo-runner",
    consumed: true,
    durability: "exclusive-create-file-sync-parent-directory-sync",
    network_allowed: false,
    real_corpus_accessed: false,
    real_repository_accessed: false,
    retry_allowed: false,
    selection_sha256: hash("b"),
    synthetic_only: true
  };
}

function rawLabels(selected) {
  return selected.map((item) => ({
    category: item.fixture.category,
    concealed_case_id: item.fixture.synthetic_identity,
    fixture_sha256: item.fixture_sha256,
    labels: structuredClone(item.fixture.labels),
    simulated_judgment: true
  }));
}

function hash(character) {
  return character.repeat(64);
}

function executeFrozenDurableWrite(callback) {
  try {
    return {
      directorySyncUnsupported: false,
      result: callback()
    };
  } catch (error) {
    const unsupportedDirectorySync =
      process.platform === "win32" &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "syscall" in error &&
      ["EBADF", "EINVAL", "ENOSYS", "ENOTSUP", "EPERM"].includes(
        String(error.code)
      ) &&
      error.syscall === "fsync";
    if (!unsupportedDirectorySync) {
      throw error;
    }
    return {
      directorySyncUnsupported: true,
      result: null
    };
  }
}
