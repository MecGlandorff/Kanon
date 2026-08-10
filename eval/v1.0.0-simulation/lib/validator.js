import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

export const SIMULATION_ROOT = "eval/v1.0.0-simulation";
export const SIMULATION_PROTOCOL_SCHEMA =
  "kanon-v1.0.0-synthetic-governance-tabletop-protocol-v1";
export const SIMULATION_ARTIFACT_SCHEMA =
  "kanon-v1.0.0-simulation-artifact-v1";
export const SIMULATION_POPULATION_SCHEMA =
  "kanon-v1.0.0-synthetic-population-v1";
export const PRODUCTION_ARTIFACT_SHA256 =
  "0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9";
export const PACKAGE_VERSION = "0.4.0-rc.1";
export const CLASSIFICATION = Object.freeze({
  evidence_classification: "simulated-development-only",
  human_independence: false,
  prospective_protocol_activated: false,
  release_authority: false,
  simulation: true
});
export const PERSONAS = Object.freeze([
  "SIM-CO",
  "SIM-CE",
  "SIM-LA",
  "SIM-LB",
  "SIM-ADJ",
  "SIM-RO"
]);
export const CONCLUSIONS = Object.freeze([
  "simulation-complete",
  "simulation-failed",
  "simulation-inconclusive",
  "simulation-invalid"
]);
export const ORDERING = Object.freeze([
  "bind-protocols-specification-and-implementation",
  "declare-six-simulated-personas",
  "freeze-population-and-contamination-registry",
  "commit-and-reveal-sim-ce-and-sim-ro-entropy",
  "deterministically-select-development-and-pseudo-holdout",
  "freeze-labeling-rubric",
  "finalize-raw-labels-a",
  "finalize-raw-labels-b-without-a-access",
  "measure-simulated-agreement",
  "adjudicate-without-predictions",
  "freeze-final-simulated-labels",
  "freeze-unchanged-baseline-candidate",
  "durably-consume-exactly-one-pseudo-attempt",
  "process-ten-pseudo-holdout-fixtures-once",
  "finalize-predictions-traces-comparison-and-gates",
  "unblind-simulated-predictions",
  "apply-simulation-gates-mechanically",
  "produce-one-permitted-simulation-conclusion"
]);

const HASH = /^[0-9a-f]{64}$/u;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+$/u;
const ARTIFACT_KEYS = Object.freeze([
  "artifact_type",
  "bindings",
  "evidence_classification",
  "human_independence",
  "payload",
  "producer",
  "prospective_protocol_activated",
  "release_authority",
  "schema",
  "sequence",
  "simulated_status",
  "simulation"
]);

export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

export function canonicalBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`);
}

export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

export function loadCanonicalJson(file, maximumBytes = 8 * 1024 * 1024) {
  const stat = fs.lstatSync(file);
  expect(stat.isFile(), "canonical-input-regular-file");
  expect(!stat.isSymbolicLink(), "canonical-input-no-link");
  expect(stat.nlink === 1, "canonical-input-one-link");
  expect(stat.size > 0 && stat.size <= maximumBytes, "canonical-input-size");
  const bytes = fs.readFileSync(file);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("simulation: canonical-input-json");
  }
  expect(
    bytes.equals(canonicalBytes(value)),
    "canonical-input-serialization"
  );
  return { bytes, sha256: sha256(bytes), value };
}

export function validateClassification(value) {
  expectPlainRecord(value, "classified value");
  for (const [key, expected] of Object.entries(CLASSIFICATION)) {
    expect(value[key] === expected, `classification-${key}`);
  }
  return true;
}

export function validateSimulationProtocol(protocol) {
  validateClassification(protocol);
  expect(
    protocol.schema === SIMULATION_PROTOCOL_SCHEMA &&
      protocol.version === 1 &&
      protocol.status === "frozen-simulation-only" &&
      protocol.namespace === SIMULATION_ROOT,
    "protocol-identity"
  );
  expect(
    isDeepStrictEqual(protocol.persona_ids, PERSONAS),
    "protocol-personas"
  );
  expect(
    isDeepStrictEqual(protocol.ordering, ORDERING),
    "protocol-ordering"
  );
  expect(
    isDeepStrictEqual(protocol.conclusions?.allowed, CONCLUSIONS) &&
      protocol.conclusions?.release_supported_allowed === false,
    "protocol-conclusions"
  );
  expect(
    protocol.design?.category_count === 5 &&
      protocol.design?.development_cases_per_category === 2 &&
      protocol.design?.pseudo_holdout_cases_per_category === 2 &&
      protocol.design?.development_total === 10 &&
      protocol.design?.pseudo_holdout_total === 10 &&
      protocol.design?.prospective_sample_requirement_satisfied === false,
    "protocol-reduced-design"
  );
  expect(
    protocol.attempt?.attempt_limit === 1 &&
      protocol.attempt?.synthetic_only === true &&
      protocol.attempt?.network_allowed === false &&
      protocol.attempt?.real_repository_allowed === false &&
      protocol.attempt?.real_corpus_allowed === false &&
      protocol.attempt?.failure_preservation === "additive-no-retry",
    "protocol-attempt-boundary"
  );
  assertCandidateBaseline(protocol.candidate);
  return true;
}

export function artifactEnvelope({
  artifactType,
  bindings,
  payload,
  producer,
  sequence
}) {
  const value = {
    artifact_type: artifactType,
    bindings: { ...bindings },
    ...CLASSIFICATION,
    payload,
    producer,
    schema: SIMULATION_ARTIFACT_SCHEMA,
    sequence,
    simulated_status: "simulated"
  };
  validateArtifact(value);
  return value;
}

export function validateArtifact(value) {
  validateClassification(value);
  expectExactKeys(value, ARTIFACT_KEYS, "artifact");
  expect(
    value.schema === SIMULATION_ARTIFACT_SCHEMA &&
      typeof value.artifact_type === "string" &&
      value.artifact_type.length > 0 &&
      value.artifact_type.length <= 160 &&
      PERSONAS.includes(value.producer) &&
      Number.isSafeInteger(value.sequence) &&
      value.sequence >= 1 &&
      value.sequence <= ORDERING.length &&
      value.simulated_status === "simulated",
    "artifact-envelope"
  );
  expectPlainRecord(value.bindings, "artifact bindings");
  expect(
    Object.keys(value.bindings).length >= 4 &&
      Object.entries(value.bindings).every(
        ([key, digest]) =>
          /^[a-z][a-z0-9_]*_sha256$/u.test(key) &&
          HASH.test(digest)
      ),
    "artifact-bindings"
  );
  expectPlainRecord(value.payload, "artifact payload");
  rejectProhibitedClaims(value.payload);
  return true;
}

export function validatePersonaDeclarations(declarations) {
  expect(Array.isArray(declarations), "persona-declarations-array");
  expect(declarations.length === PERSONAS.length, "persona-count");
  expect(
    isDeepStrictEqual(
      declarations.map((item) => item.persona_id),
      PERSONAS
    ),
    "persona-order-and-identity"
  );
  for (const declaration of declarations) {
    expectPlainRecord(declaration, "persona declaration");
    expect(
      declaration.simulated === true &&
        declaration.human === false &&
        declaration.human_attestation === false &&
        declaration.independence_claim === false &&
        declaration.blindness_proof_claim === false &&
        declaration.controlled_by === "one-user-and-agent-system" &&
        typeof declaration.procedural_role === "string" &&
        declaration.procedural_role.length > 0,
      `persona-${declaration.persona_id}-simulation-disclosure`
    );
  }
  return true;
}

export function validateAccessEnvelope(envelope) {
  expectPlainRecord(envelope, "access envelope");
  expect(
    PERSONAS.includes(envelope.persona_id) &&
      envelope.simulated === true &&
      envelope.procedural_only === true &&
      envelope.human_independence === false &&
      Array.isArray(envelope.permitted_input_kinds) &&
      Array.isArray(envelope.forbidden_input_kinds) &&
      new Set(envelope.permitted_input_kinds).size ===
        envelope.permitted_input_kinds.length &&
      new Set(envelope.forbidden_input_kinds).size ===
        envelope.forbidden_input_kinds.length &&
      envelope.permitted_input_kinds.every(
        (item) => typeof item === "string" && item.length > 0
      ) &&
      envelope.forbidden_input_kinds.every(
        (item) => typeof item === "string" && item.length > 0
      ),
    "access-envelope-fields"
  );
  const overlap = envelope.permitted_input_kinds.filter((kind) =>
    envelope.forbidden_input_kinds.includes(kind)
  );
  expect(overlap.length === 0, "access-envelope-overlap");
  return true;
}

export function validateAccessLedger(entries, envelopes) {
  expect(Array.isArray(entries) && entries.length > 0, "access-ledger-array");
  const envelopeByPersona = new Map(
    envelopes.map((item) => {
      validateAccessEnvelope(item);
      return [item.persona_id, item];
    })
  );
  let previous = 0;
  for (const wrapped of entries) {
    const entry = wrapped?.payload || wrapped;
    expectPlainRecord(entry, "access ledger entry");
    expect(
      Number.isSafeInteger(entry.ledger_sequence) &&
        entry.ledger_sequence === previous + 1 &&
        PERSONAS.includes(entry.persona_id) &&
        HASH.test(entry.envelope_sha256 || "") &&
        Number.isSafeInteger(entry.role_execution_sequence) &&
        entry.role_execution_sequence >= 1 &&
        entry.role_execution_sequence <= ORDERING.length &&
        Array.isArray(entry.inputs) &&
        entry.inputs.length > 0,
      "access-ledger-fields"
    );
    previous = entry.ledger_sequence;
    const envelope = envelopeByPersona.get(entry.persona_id);
    expect(Boolean(envelope), "access-ledger-envelope");
    expect(
      entry.envelope_sha256 === sha256(canonicalBytes(envelope)),
      "access-ledger-envelope-commitment"
    );
    for (const input of entry.inputs) {
      expectPlainRecord(input, "access ledger input");
      expect(
        typeof input.kind === "string" &&
          HASH.test(input.sha256 || "") &&
          envelope.permitted_input_kinds.includes(input.kind) &&
          !envelope.forbidden_input_kinds.includes(input.kind),
        `access-envelope-enforcement-${entry.persona_id}`
      );
    }
  }
  return true;
}

export function validateOrdering(events, options = {}) {
  expect(Array.isArray(events) && events.length > 0, "ordering-events-array");
  let previous = 0;
  const index = new Map();
  for (const event of events) {
    expectPlainRecord(event, "ordering event");
    expect(
      Number.isSafeInteger(event.sequence) &&
        event.sequence === previous + 1 &&
        typeof event.type === "string" &&
        ORDERING.includes(event.type) &&
        HASH.test(event.output_commitment_sha256 || "") &&
        event.mutation_after_consumption === false,
      "ordering-event-fields"
    );
    expect(!index.has(event.type), "ordering-duplicate-event");
    previous = event.sequence;
    index.set(event.type, event.sequence);
  }
  if (options.requireComplete !== false) {
    expect(
      events.length === ORDERING.length &&
        isDeepStrictEqual(
          events.map((event) => event.type),
          ORDERING
        ),
      "ordering-exact-sequence"
    );
  }
  requireBefore(
    index,
    "commit-and-reveal-sim-ce-and-sim-ro-entropy",
    "deterministically-select-development-and-pseudo-holdout"
  );
  requireBefore(
    index,
    "freeze-labeling-rubric",
    "finalize-raw-labels-a"
  );
  requireBefore(
    index,
    "freeze-labeling-rubric",
    "finalize-raw-labels-b-without-a-access"
  );
  requireBefore(
    index,
    "finalize-raw-labels-a",
    "measure-simulated-agreement"
  );
  requireBefore(
    index,
    "finalize-raw-labels-b-without-a-access",
    "measure-simulated-agreement"
  );
  requireBefore(
    index,
    "measure-simulated-agreement",
    "adjudicate-without-predictions"
  );
  requireBefore(
    index,
    "freeze-final-simulated-labels",
    "freeze-unchanged-baseline-candidate"
  );
  requireBefore(
    index,
    "freeze-final-simulated-labels",
    "finalize-predictions-traces-comparison-and-gates"
  );
  requireBefore(
    index,
    "freeze-final-simulated-labels",
    "unblind-simulated-predictions"
  );
  requireBefore(
    index,
    "freeze-unchanged-baseline-candidate",
    "durably-consume-exactly-one-pseudo-attempt"
  );
  requireBefore(
    index,
    "durably-consume-exactly-one-pseudo-attempt",
    "process-ten-pseudo-holdout-fixtures-once"
  );
  requireBefore(
    index,
    "process-ten-pseudo-holdout-fixtures-once",
    "unblind-simulated-predictions"
  );
  requireBefore(
    index,
    "unblind-simulated-predictions",
    "apply-simulation-gates-mechanically"
  );
  requireBefore(
    index,
    "apply-simulation-gates-mechanically",
    "produce-one-permitted-simulation-conclusion"
  );
  return true;
}

export function validateHandoffs(handoffs) {
  expect(
    Array.isArray(handoffs) && handoffs.length >= ORDERING.length,
    "handoff-array"
  );
  let previous = 0;
  for (const wrapped of handoffs) {
    validateArtifact(wrapped);
    const handoff = wrapped.payload;
    expect(
      wrapped.artifact_type === "persona-handoff" &&
        Number.isSafeInteger(handoff.handoff_sequence) &&
        handoff.handoff_sequence === previous + 1 &&
        Number.isSafeInteger(handoff.lifecycle_sequence) &&
        handoff.lifecycle_sequence >= 1 &&
        handoff.lifecycle_sequence <= ORDERING.length &&
        PERSONAS.includes(handoff.producing_persona) &&
        PERSONAS.includes(handoff.consuming_persona) &&
        Array.isArray(handoff.exact_input_commitments) &&
        handoff.exact_input_commitments.every((item) => HASH.test(item)) &&
        HASH.test(handoff.exact_output_commitment || "") &&
        handoff.classification === "simulated-development-only" &&
        handoff.simulated === true,
      "handoff-fields"
    );
    previous = handoff.handoff_sequence;
  }
  return true;
}

export function validateConclusion(conclusion) {
  expect(
    typeof conclusion === "string" && CONCLUSIONS.includes(conclusion),
    "conclusion-restriction"
  );
  return conclusion;
}

export function assertCandidateBaseline(candidate) {
  expectPlainRecord(candidate, "candidate baseline");
  expect(
    candidate.production_artifact_sha256 ===
      PRODUCTION_ARTIFACT_SHA256 &&
      candidate.package_version === PACKAGE_VERSION &&
      candidate.runtime_dependency_count === 0 &&
      candidate.production_change_allowed === false,
    "unchanged-production-artifact-binding"
  );
  if (candidate.source_commit !== undefined) {
    expect(
      SOURCE_COMMIT.test(candidate.source_commit),
      "candidate-source-commit"
    );
  }
  return true;
}

export function consumePseudoAttempt(state, receipt) {
  expectPlainRecord(state, "pseudo attempt state");
  expectPlainRecord(receipt, "pseudo attempt receipt");
  expect(
    state.authorized === true &&
      state.consumed_count === 0 &&
      receipt.attempt_ordinal === 1 &&
      receipt.case_ordinal === 1 &&
      receipt.consumed === true &&
      receipt.synthetic_only === true &&
      receipt.network_allowed === false &&
      receipt.real_repository_accessed === false &&
      receipt.real_corpus_accessed === false &&
      receipt.retry_allowed === false &&
      receipt.component === "canonical-simulation-pseudo-runner" &&
      receipt.durability ===
        "exclusive-create-file-sync-parent-directory-sync" &&
      HASH.test(receipt.candidate_freeze_sha256 || "") &&
      HASH.test(receipt.selection_sha256 || ""),
    "one-durable-pseudo-attempt"
  );
  return {
    authorized: true,
    consumed_count: 1,
    receipt_sha256: sha256(canonicalBytes(receipt))
  };
}

export function validateSyntheticFixture(fixture) {
  expectPlainRecord(fixture, "synthetic fixture");
  expectExactKeys(
    fixture,
    [
      "case_id",
      "category",
      "files",
      "labels",
      "partition",
      "synthetic_identity",
      "variant"
    ],
    "synthetic fixture"
  );
  expect(
    /^sim-(?:dev|pseudo)-[a-z]{3}-0[12]$/u.test(fixture.case_id) &&
      [
        "service-layout",
        "workspace-layout",
        "model-layout",
        "web-layout",
        "command-layout"
      ].includes(fixture.category) &&
      [
        "synthetic-development",
        "synthetic-pseudo-holdout"
      ].includes(fixture.partition) &&
      Number.isSafeInteger(fixture.variant) &&
      fixture.variant >= 1 &&
      fixture.variant <= 4 &&
      HASH.test(fixture.synthetic_identity || ""),
    "synthetic-fixture-identity"
  );
  rejectRealRepositoryIdentity(fixture);
  expectPlainRecord(fixture.files, "synthetic fixture files");
  expect(
    Object.keys(fixture.files).length >= 6 &&
      Object.entries(fixture.files).every(
        ([relative, contents]) =>
          isSafeFixturePath(relative) &&
          typeof contents === "string" &&
          Buffer.byteLength(contents) <= 64 * 1024 &&
          !looksNetworkDerived(contents)
      ),
    "synthetic-fixture-material"
  );
  expectPlainRecord(fixture.labels, "synthetic fixture labels");
  expect(
    Array.isArray(fixture.labels.important_files) &&
      fixture.labels.important_files.length === 5 &&
      fixture.labels.important_files.every(
        (relative) =>
          typeof relative === "string" &&
          Object.hasOwn(fixture.files, relative)
      ) &&
      validateSyntheticCommand(fixture.labels.run) &&
      validateSyntheticCommand(fixture.labels.test) &&
      fixture.labels.status === "labelable",
    "synthetic-fixture-labels"
  );
  return true;
}

export function validateSimulationPath(relative) {
  expect(
    typeof relative === "string" &&
      relative.startsWith(`${SIMULATION_ROOT}/`) &&
      SAFE_RELATIVE.test(relative) &&
      !relative.includes("\\") &&
      !relative.includes("\0") &&
      !relative.startsWith("eval/v1.0.0-prospective/") &&
      !relative.startsWith("eval/results/") &&
      !relative.startsWith("eval/d2e/"),
    "simulation-namespace-containment"
  );
  return true;
}

export function writeCanonicalExclusive(
  root,
  relative,
  value,
  options = {}
) {
  const target = resolveOutputPath(root, relative);
  ensureSafeParent(root, path.dirname(relative));
  const bytes = canonicalBytes(value);
  expect(
    bytes.length <= (options.maximumBytes || 16 * 1024 * 1024),
    "output-byte-limit"
  );
  const flags =
    fs.constants.O_CREAT |
    fs.constants.O_EXCL |
    fs.constants.O_WRONLY |
    (fs.constants.O_NOFOLLOW || 0);
  const descriptor = fs.openSync(target, flags, 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    if (options.durable === true) {
      fs.fsyncSync(descriptor);
    }
  } finally {
    fs.closeSync(descriptor);
  }
  if (options.durable === true) {
    syncDirectory(path.dirname(target));
  }
  return {
    bytes: bytes.length,
    path: target,
    relative,
    sha256: sha256(bytes)
  };
}

export function preserveSimulationFailure({
  bindings,
  error,
  root,
  sequence = 18
}) {
  expect(fs.lstatSync(root).isDirectory(), "failure-root-directory");
  const before = completeTreeCommitment(root);
  const failure = artifactEnvelope({
    artifactType: "failure-manifest",
    bindings,
    payload: {
      additive: true,
      prior_file_count: before.files.length,
      prior_tree_sha256: before.sha256,
      retry_permitted: false,
      sanitized_error: boundedText(error),
      simulation_conclusion: "simulation-invalid"
    },
    producer: "SIM-CE",
    sequence
  });
  const written = writeCanonicalExclusive(
    root,
    "failure-manifest.json",
    failure,
    { durable: true }
  );
  const after = completeTreeCommitment(root);
  expect(
    before.files.every((entry) =>
      after.files.some(
        (candidate) =>
          candidate.path === entry.path &&
          candidate.sha256 === entry.sha256 &&
          candidate.bytes === entry.bytes
      )
    ),
    "failure-preservation"
  );
  return { after, before, written };
}

export function completeTreeCommitment(root, options = {}) {
  const canonicalRoot = fs.realpathSync(root);
  const excluded = new Set(options.exclude || []);
  const files = [];
  const pending = [""];
  while (pending.length) {
    const relativeDirectory = pending.pop();
    const directory = relativeDirectory
      ? path.join(canonicalRoot, relativeDirectory)
      : canonicalRoot;
    const directoryStat = fs.lstatSync(directory);
    expect(
      directoryStat.isDirectory() && !directoryStat.isSymbolicLink(),
      "tree-directory"
    );
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      right.name.localeCompare(left.name)
    )) {
      const relative = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (excluded.has(relative)) {
        continue;
      }
      const target = path.join(canonicalRoot, relative);
      const stat = fs.lstatSync(target);
      expect(!stat.isSymbolicLink(), `tree-link-${relative}`);
      if (stat.isDirectory()) {
        pending.push(relative);
        continue;
      }
      expect(stat.isFile(), `tree-regular-${relative}`);
      expect(stat.nlink === 1, `tree-one-link-${relative}`);
      const bytes = fs.readFileSync(target);
      files.push({
        bytes: bytes.length,
        path: relative.replaceAll("\\", "/"),
        sha256: sha256(bytes)
      });
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    files,
    sha256: sha256(canonicalBytes(files))
  };
}

export function hashDirectory(root, relative) {
  const target = path.join(root, relative);
  const stat = fs.lstatSync(target);
  expect(stat.isDirectory() && !stat.isSymbolicLink(), "hash-directory");
  return completeTreeCommitment(target);
}

export function validateFinalEvidenceDirectory(root, expected = {}) {
  const stat = fs.lstatSync(root);
  expect(stat.isDirectory() && !stat.isSymbolicLink(), "evidence-root");
  const files = completeTreeCommitment(root).files;
  const artifacts = [];
  for (const entry of files) {
    expect(entry.path.endsWith(".json"), `evidence-json-only-${entry.path}`);
    const loaded = loadCanonicalJson(path.join(root, entry.path));
    validateArtifact(loaded.value);
    artifacts.push({ path: entry.path, sha256: loaded.sha256, value: loaded.value });
  }
  const byType = new Map();
  for (const artifact of artifacts) {
    const existing = byType.get(artifact.value.artifact_type) || [];
    existing.push(artifact);
    byType.set(artifact.value.artifact_type, existing);
  }
  requireTypeCount(byType, "simulation-binding", 1);
  requireTypeCount(byType, "persona-declarations", 1);
  requireTypeCount(byType, "access-envelope", 6);
  requireTypeCount(byType, "raw-labels-a", 1);
  requireTypeCount(byType, "raw-labels-b", 1);
  requireTypeCount(byType, "candidate-freeze", 1);
  requireTypeCount(byType, "pseudo-attempt-consumption", 1);
  requireTypeCount(byType, "fixture-prediction", 10);
  requireTypeCount(byType, "fixture-trace", 10);
  requireTypeCount(byType, "simulation-gates", 1);
  requireTypeCount(byType, "simulation-conclusion", 1);
  requireTypeCount(byType, "evidence-manifest", 1);
  requireTypeCount(byType, "complete-tree-commitment", 1);

  const declarations =
    byType.get("persona-declarations")[0].value.payload.declarations;
  validatePersonaDeclarations(declarations);
  const envelopes = byType
    .get("access-envelope")
    .map((item) => item.value.payload.envelope);
  const ledgerEntries = byType
    .get("access-ledger-entry")
    .map((item) => item.value);
  validateAccessLedger(ledgerEntries, envelopes);
  validateHandoffs(
    byType.get("persona-handoff").map((item) => item.value)
  );
  const ordering =
    byType.get("ordering-record")[0].value.payload.events;
  validateOrdering(ordering);
  const candidate =
    byType.get("candidate-freeze")[0].value.payload.candidate;
  assertCandidateBaseline(candidate);
  const conclusion =
    byType.get("simulation-conclusion")[0].value.payload.conclusion;
  validateConclusion(conclusion);
  expect(
    conclusion !== "release-supported" &&
      byType.get("simulation-conclusion")[0].value.payload
        .release_supported_conclusion === false,
    "no-release-supported-conclusion"
  );

  const receipt =
    byType.get("pseudo-attempt-consumption")[0].value.payload.receipt;
  consumePseudoAttempt(
    { authorized: true, consumed_count: 0 },
    receipt
  );
  const processed = byType
    .get("fixture-trace")
    .map((item) => item.value.payload.concealed_case_id);
  expect(
    processed.length === 10 &&
      new Set(processed).size === 10 &&
      byType.get("fixture-trace").every(
        (item) => item.value.payload.processing_count === 1
      ),
    "pseudo-fixtures-exactly-once"
  );

  const treeArtifact = byType.get("complete-tree-commitment")[0];
  const recomputed = completeTreeCommitment(root, {
    exclude: [treeArtifact.path]
  });
  expect(
    treeArtifact.value.payload.complete_tree_sha256 === recomputed.sha256 &&
      isDeepStrictEqual(
        treeArtifact.value.payload.files,
        recomputed.files
      ),
    "complete-tree-binding"
  );
  const baseName = path.basename(root);
  expect(
    baseName === `evidence-sha256-${recomputed.sha256}`,
    "content-addressed-directory"
  );
  if (expected.completeTreeSha256) {
    expect(
      expected.completeTreeSha256 === recomputed.sha256,
      "expected-complete-tree"
    );
  }
  return {
    artifact_count: artifacts.length,
    complete_tree_sha256: recomputed.sha256,
    conclusion,
    file_count: files.length
  };
}

function rejectProhibitedClaims(value) {
  const pending = [value];
  let visited = 0;
  while (pending.length) {
    const current = pending.pop();
    visited += 1;
    expect(visited <= 100_000, "artifact-structure-bound");
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!isPlainRecord(current)) {
      if (typeof current === "string") {
        expect(
          current !== "release-supported" &&
            current !== "release-not-supported",
          "release-conclusion-claim"
        );
      }
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (
        [
          "is_human",
          "real_human",
          "human_attestation",
          "human_independence",
          "independence_proven",
          "blindness_proven",
          "release_authority",
          "prospective_protocol_activated"
        ].includes(key)
      ) {
        expect(child !== true, `prohibited-claim-${key}`);
      }
      pending.push(child);
    }
  }
}

function rejectRealRepositoryIdentity(value) {
  const pending = [value];
  const forbiddenKeys = new Set([
    "canonical_owner",
    "clone_url",
    "fork_root",
    "host",
    "owner",
    "provider_repository_id",
    "repository",
    "repository_name",
    "repository_url",
    "revision",
    "url"
  ]);
  let visited = 0;
  while (pending.length) {
    const current = pending.pop();
    visited += 1;
    expect(visited <= 20_000, "fixture-structure-bound");
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!isPlainRecord(current)) {
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      expect(!forbiddenKeys.has(key), `real-repository-field-${key}`);
      pending.push(child);
    }
  }
}

function looksNetworkDerived(value) {
  return (
    /https?:\/\//iu.test(value) ||
    /git@[\w.-]+:/iu.test(value) ||
    /\b(?:github|gitlab|bitbucket)\.com\b/iu.test(value)
  );
}

function validateSyntheticCommand(value) {
  return Boolean(
    isPlainRecord(value) &&
      value.cwd === "." &&
      typeof value.command === "string" &&
      value.command.length > 0 &&
      value.command.length <= 200 &&
      !looksNetworkDerived(value.command)
  );
}

function isSafeFixturePath(relative) {
  return Boolean(
    typeof relative === "string" &&
      relative.length > 0 &&
      relative.length <= 240 &&
      SAFE_RELATIVE.test(relative) &&
      !relative.includes("\\") &&
      !relative.startsWith(".git/") &&
      relative !== ".git"
  );
}

function resolveOutputPath(root, relative) {
  expect(
    typeof relative === "string" &&
      relative.length > 0 &&
      relative.length <= 500 &&
      SAFE_RELATIVE.test(relative) &&
      !relative.includes("\\"),
    "output-relative-path"
  );
  const canonicalRoot = fs.realpathSync(root);
  const target = path.resolve(canonicalRoot, relative);
  expect(
    target.startsWith(`${canonicalRoot}${path.sep}`),
    "output-containment"
  );
  return target;
}

function ensureSafeParent(root, relativeParent) {
  const canonicalRoot = fs.realpathSync(root);
  if (!relativeParent || relativeParent === ".") {
    return canonicalRoot;
  }
  const segments = relativeParent.split("/");
  let current = canonicalRoot;
  for (const segment of segments) {
    expect(
      segment && segment !== "." && segment !== "..",
      "output-parent-segment"
    );
    current = path.join(current, segment);
    if (!fs.existsSync(current)) {
      fs.mkdirSync(current, { mode: 0o700 });
    }
    const stat = fs.lstatSync(current);
    expect(
      stat.isDirectory() && !stat.isSymbolicLink(),
      "output-parent-directory"
    );
    expect(
      fs.realpathSync(current).startsWith(`${canonicalRoot}${path.sep}`),
      "output-parent-containment"
    );
  }
  return current;
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!isUnsupportedDirectorySync(error)) {
      throw error;
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function isUnsupportedDirectorySync(error) {
  return (
    process.platform === "win32" &&
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["EBADF", "EINVAL", "ENOSYS", "ENOTSUP", "EPERM"].includes(
      String(error.code)
    )
  );
}

function requireBefore(index, before, after) {
  if (!index.has(after)) {
    return;
  }
  expect(
    index.has(before) && index.get(before) < index.get(after),
    `${before}-must-precede-${after}`
  );
}

function requireTypeCount(byType, type, count) {
  expect(
    (byType.get(type) || []).length === count,
    `evidence-type-${type}-${count}`
  );
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    );
  }
  expect(
    value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)),
    "canonical-supported-value"
  );
  return value;
}

function boundedText(value) {
  return String(value ?? "unknown")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .slice(0, 1_000);
}

function isPlainRecord(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}

function expectPlainRecord(value, label) {
  expect(isPlainRecord(value), `${label}-object`);
}

function expectExactKeys(value, expected, label) {
  expect(
    isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort()),
    `${label}-keys`
  );
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(`simulation: ${label}`);
  }
}
