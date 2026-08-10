import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  canonicalJson,
  sha256
} from "../../../scripts/lib/v1-prospective-release.js";

export const MAINTAINER_ROOT = "eval/v1.0.0-maintainer";
export const MAINTAINER_PROTOCOL_SCHEMA =
  "kanon-v1.0.0-maintainer-assurance-standard-v1";
export const RISK_LEDGER_SCHEMA =
  "kanon-v1.0.0-maintainer-risk-ledger-v1";
export const WAIVER_SCHEMA =
  "kanon-v1.0.0-solo-maintainer-waiver-v1";
export const CANDIDATE_SOURCE_COMMIT =
  "7d35c81742ca7cbcd26207f3cf7b18fc09804041";
export const PRODUCTION_ARTIFACT_SHA256 =
  "0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9";
export const PUBLIC_CAPABILITIES_SHA256 =
  "bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf";
export const PACKAGE_VERSION = "0.4.0-rc.1";

export const CONCLUSIONS = Object.freeze([
  "maintainer-certification-ready",
  "maintainer-certification-not-ready",
  "maintainer-certification-inconclusive"
]);

export const GATE_IDS = Object.freeze([
  "exact-source-artifact-binding",
  "clean-worktree-expected-branch",
  "complete-project-validation",
  "zero-test-failures",
  "strict-checked-javascript-type-validation",
  "generated-synchronization",
  "javascript-syntax-json-parsing",
  "git-diff-check",
  "two-byte-identical-production-packs",
  "exact-package-inventory",
  "exact-tarball-install-path-with-spaces",
  "installed-artifact-conformance",
  "package-version-consistency",
  "lockfile-consistency",
  "zero-unexpected-dependencies",
  "unchanged-public-capability-declarations",
  "no-known-unreviewed-production-diff",
  "no-unresolved-p0-product-integrity",
  "accurate-readme-changelog-installation-compatibility-security-and-limitations",
  "complete-risk-ledger",
  "every-waived-evidence-and-performance-risk-explicitly-named",
  "no-forbidden-release-claim",
  "authentic-solo-maintainer-approval"
]);

export const RISK_IDS = Object.freeze([
  "RISK-HISTORICAL-STRICT-EQUIVALENCE",
  "RISK-D2A-CANDIDATE-MEMBERSHIP",
  "RISK-D2A-SCAN-DIAGNOSTICS",
  "RISK-HUMAN-INDEPENDENCE",
  "RISK-INDEPENDENT-LABELS",
  "RISK-UNSEEN-HOLDOUT",
  "RISK-VISIBLE-PERFORMANCE-THRESHOLDS",
  "RISK-NINE-INCOMPLETE-SCANS",
  "RISK-VISIBLE-FP-FN",
  "RISK-IMPORTANT-FILE-METRICS",
  "RISK-RUN-COMMAND-RECALL",
  "RISK-LABEL-VALIDITY",
  "RISK-GENERALIZATION",
  "RISK-WITHDRAWN-CORRECTION",
  "RISK-PLATFORM-SKIPS",
  "RISK-NATIVE-WINDOWS-LINUX",
  "RISK-ADVISORY-FALSE-POSITIVE",
  "RISK-ADVISORY-FALSE-NEGATIVE",
  "RISK-PUBLIC-DOCUMENTATION-DRIFT",
  "RISK-FUTURE-MAINTENANCE-OBLIGATIONS"
]);

export const WAIVER_RISK_IDS = Object.freeze(RISK_IDS.slice(0, 18));

export const PERMITTED_CLAIMS = Object.freeze([
  "deterministic-artifact-construction",
  "installed-artifact-conformance",
  "public-api-and-capability-stability",
  "explicit-only-invocation",
  "advisory-and-non-enforcing-behavior",
  "zero-runtime-optional-and-peer-dependencies",
  "documented-compatibility",
  "complete-passing-project-validation-on-observed-platforms",
  "known-development-corpus-metrics-with-limitations"
]);

export const FORBIDDEN_CLAIMS = Object.freeze([
  "evidence-strict-release-supported",
  "independent-validation",
  "blinded-human-review",
  "causal-improvement",
  "official-holdout-score",
  "historical-strict-equivalence-success",
  "seven-performance-failures-resolved",
  "generalization-beyond-observed-evidence",
  "unexecuted-native-platform-conformance",
  "correction-derived-precision-improvement"
]);

const EXPECTED_BINDINGS = Object.freeze({
  artifact_sha256: PRODUCTION_ARTIFACT_SHA256,
  branch: "release/v.1.0.0",
  candidate_source_commit: CANDIDATE_SOURCE_COMMIT,
  optional_dependencies: 0,
  package_version: PACKAGE_VERSION,
  peer_dependencies: 0,
  public_capabilities_sha256: PUBLIC_CAPABILITIES_SHA256,
  runtime_dependencies: 0,
  strict_historical_equivalence:
    "failed-required-comparison-unavailable"
});

const EXPECTED_EVIDENCE = Object.freeze([
  ["historical-strict-equivalence-result", "eval/results/d2e-recovery-b26f85c47e98a686a79cce5359b50a559db483b70ecd23d15eda014621d411f1/equivalence.json", "681adc6b0622a032ff2599024c9c53f6268476b53c9a07f79c590b92831e9689"],
  ["d2e-recovery-binding", "eval/results/d2e-recovery-b26f85c47e98a686a79cce5359b50a559db483b70ecd23d15eda014621d411f1/recovery-binding.json", "b26f85c47e98a686a79cce5359b50a559db483b70ecd23d15eda014621d411f1"],
  ["d2e-analysis-result", "eval/results/d2e-analysis-b84a9706ebe948303c9e6bc67641fc0dcbef81c0a873098c1d65c2be2dfef81b/analysis.json", "b84a9706ebe948303c9e6bc67641fc0dcbef81c0a873098c1d65c2be2dfef81b"],
  ["d2e-mechanism-analysis", "eval/results/d2e-analysis-b84a9706ebe948303c9e6bc67641fc0dcbef81c0a873098c1d65c2be2dfef81b/mechanism-analysis.json", "0e45bd4dd56cb0c437cfd3ecc8f79d034339f285609da5287678991ee4498bf2"],
  ["withdrawn-correction-record", "docs/v1-run-package-declarations-correction.md", "54e9bc745c2ebe0797acf4cb7f305763d69af86c323f3383b0418f90abdcb998"],
  ["post-correction-authority", "eval/d2e/POST_CORRECTION_AUTHORITY.json", "b4227670b7b831f1949598add2fa538c875cdb90ab55b1820a35ba81b5543087"],
  ["post-correction-attempt-binding", "eval/results/post-correction-attempt-sha256-253e42864db043281cc28ec3b60cb9e7fb0f678647c843194210f6356f144525/attempt-binding.json", "4c01e9b9983649efcaacb29d0bb192b74006f61b0f9f1a4dd20b437898e40cea"],
  ["post-correction-evaluation", "eval/results/post-correction-evidence-sha256-b2259cef72b0bba7b37fbab37f1d0edcbd592235f92b5813da7f814855f74636/evaluation-record.json", "002b31db1a3c44e488466ff6655707f07c38a0f21487cd9dc0b5d5b4424c8b30"],
  ["post-correction-comparison", "eval/results/post-correction-evidence-sha256-b2259cef72b0bba7b37fbab37f1d0edcbd592235f92b5813da7f814855f74636/comparison.json", "05d466b8ac85b543bd89e08addab41ef2e072af37207a73a0be07766034a3a97"],
  ["withdrawal-and-restoration-record", "docs/v1-run-package-declarations-withdrawal.md", "4b2fd7699808cb8682095f29a1ac68a1dac5e3d81c1301bc2a18e58e8f1e8967"],
  ["prospective-protocol", "eval/v1.0.0-prospective/PROTOCOL.json", "254917b8a47a51f52d4af022dc7146a9f0755836242b1c491e6a0a583e0b8f73"],
  ["simulation-specification", "6-people-sim.md", "8077343f989caf30e01072ee5bd207bf60ec49eafe500b246f4fc3da83d046e4"],
  ["simulation-protocol", "eval/v1.0.0-simulation/PROTOCOL.json", "c9c2b15361dd3a5f6284bc10972e2dc62e2ba2c8fcc19c55cc28475d441d2cc7"],
  ["simulation-evidence-tree", "eval/v1.0.0-simulation/evidence-sha256-42f36e5fea80a84523995c5b394bcb8c4fc5b300a39b763d14277408cff96dc5/complete-tree-commitment.json", "4a3f03538aa170687af8561201ccb89010e8df8ad77e6d62203b2c6a871cdd6c"],
  ["simulation-run-record", "eval/v1.0.0-simulation/evidence-sha256-42f36e5fea80a84523995c5b394bcb8c4fc5b300a39b763d14277408cff96dc5/run-record.json", "baf25e98f6efa19f1a6f363ed44c5bee750c2965db368e44d2e12c85b9dc0855"],
  ["package-metadata", "package.json", "d8c5bbf8018307efbd2330b1395228f5bbbb85ea2d54cf48f020e9c75f4760f3"],
  ["lockfile-metadata", "package-lock.json", "d540c58992283c0773d5e4c74590085678dfab798a5bbafcb93593c656ac89cc"],
  ["source-version", "src/version.js", "7b1cb36d931a7fba2696e1f5ae21925a3c0c79fc21ad8f76f1cd444a98c7e5e6"],
  ["public-capabilities", "src/v1/build-metadata.json", PUBLIC_CAPABILITIES_SHA256],
  ["public-readme", "README.md", "ace87f1ea57c9eea2792f37a060581d74cb72c73fe1c61eac94f8aae38c86169"],
  ["installed-readme", "packaging/README.md", "52d109a38c2bd39618e5861c61d9a6eab9ca79d1d2a551547241c76d684c9a58"],
  ["validation-and-conformance-record", "docs/v1-run-prospective-release-protocol-freeze.md", "e0956f4bb6f5e65c8b3926fb82c0359b21d55ca3b7837d9100c487aeca19cc86"]
]);

const ACKNOWLEDGMENTS = Object.freeze([
  "claims_remain_within_frozen_boundary",
  "fp_fn_may_generalize_differently",
  "release_is_not_evidence_strict",
  "seven_performance_failures_and_nine_incomplete_scans",
  "six_person_simulation_is_not_independent_evidence"
]);
const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PLACEHOLDER_OR_NONHUMAN =
  /(?:^SIM-|(?:^|\b)(?:agent|bot|model|codex|chatgpt|gpt|claude|simulated|simulation|persona|tbd|todo|unknown|unassigned|placeholder|fixture|example|test)(?:\b|$))/iu;

export function canonicalBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`);
}

export function loadCanonicalJson(file, maximumBytes = 4 * 1024 * 1024) {
  const stat = fs.lstatSync(file);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, "canonical-regular-file");
  expect(stat.size > 0 && stat.size <= maximumBytes, "canonical-size");
  const bytes = fs.readFileSync(file);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("maintainer-assurance: canonical-json-parse");
  }
  expect(bytes.equals(canonicalBytes(value)), "canonical-serialization");
  return { bytes, sha256: sha256(bytes), value };
}

export function validateMaintainerBundle(repoRoot) {
  const root = path.resolve(repoRoot);
  const schema = loadCanonicalJson(path.join(root, MAINTAINER_ROOT, "schema.json"));
  const protocol = loadCanonicalJson(path.join(root, MAINTAINER_ROOT, "PROTOCOL.json"));
  const ledger = loadCanonicalJson(path.join(root, MAINTAINER_ROOT, "RISK_LEDGER.json"));
  const waiver = loadCanonicalJson(path.join(root, MAINTAINER_ROOT, "WAIVER.template.json"));
  validateSchema(schema.value);
  validateProtocol(protocol.value, root);
  validateRiskLedger(ledger.value, protocol.value);
  const approval = validateWaiver(
    waiver.value,
    protocol.sha256,
    ledger.sha256,
    protocol.value,
    ledger.value
  );
  validateRepositoryBindings(root);
  return {
    approval,
    hashes: {
      protocol: protocol.sha256,
      risk_ledger: ledger.sha256,
      schema: schema.sha256,
      waiver: waiver.sha256
    },
    ledger: ledger.value,
    protocol: protocol.value,
    waiver: waiver.value
  };
}

export function validateProtocol(protocol, repoRoot) {
  expectPlainRecord(protocol, "protocol");
  expectExactKeys(protocol, [
    "bindings", "claim_boundary", "conclusions", "engineering_gates",
    "evidence_bindings", "evidence_classification", "namespace",
    "post_release_obligations", "readiness", "release_action",
    "relationship_to_evidence_strict", "risk_policy", "schema", "status",
    "v1_meaning", "version"
  ], "protocol");
  expect(
    protocol.schema === MAINTAINER_PROTOCOL_SCHEMA &&
      protocol.version === 1 &&
      protocol.status === "frozen-awaiting-solo-maintainer-approval" &&
      protocol.namespace === MAINTAINER_ROOT,
    "protocol-identity"
  );
  expect(isDeepStrictEqual(protocol.bindings, EXPECTED_BINDINGS), "protocol-bindings");
  expect(isDeepStrictEqual(protocol.conclusions, CONCLUSIONS), "conclusion-vocabulary");
  expect(!protocol.conclusions.some((item) => /release-supported/u.test(item)), "no-prospective-conclusion");
  expect(
    isDeepStrictEqual(protocol.claim_boundary?.permitted, PERMITTED_CLAIMS) &&
      isDeepStrictEqual(protocol.claim_boundary?.forbidden, FORBIDDEN_CLAIMS) &&
      protocol.claim_boundary?.public_release_notes_must_use_exact_boundary === true,
    "claim-boundary"
  );
  expect(
    isDeepStrictEqual(
      protocol.engineering_gates.map((gate) => gate.id),
      GATE_IDS
    ),
    "gate-inventory"
  );
  for (const gate of protocol.engineering_gates) {
    expectExactKeys(gate, ["id", "kind", "required", "waivable"], `gate-${gate.id}`);
    expect(
      ["engineering", "governance", "human-approval", "product-integrity"].includes(gate.kind) &&
        gate.required === true &&
        gate.waivable === false,
      `gate-policy-${gate.id}`
    );
  }
  expect(
    protocol.relationship_to_evidence_strict.activates_prospective_protocol === false &&
      protocol.relationship_to_evidence_strict.amends_prospective_protocol === false &&
      protocol.relationship_to_evidence_strict.weakens_prospective_protocol === false &&
      protocol.relationship_to_evidence_strict.passes_prospective_protocol === false &&
      protocol.relationship_to_evidence_strict.supersedes_prospective_protocol === false &&
      protocol.relationship_to_evidence_strict.repairs_historical_strict_equivalence === false &&
      protocol.relationship_to_evidence_strict.creates_independent_evidence === false &&
      protocol.relationship_to_evidence_strict.creates_blinded_evidence === false &&
      protocol.relationship_to_evidence_strict.creates_causal_evidence === false &&
      protocol.relationship_to_evidence_strict.creates_holdout_evidence === false &&
      protocol.relationship_to_evidence_strict.human_owned_risk_decision_only === true &&
      protocol.relationship_to_evidence_strict.maintainer_ready_equivalent_to_prospective_release_supported === false &&
      protocol.relationship_to_evidence_strict.prospective_lane_available_for_future_completion === true,
    "evidence-strict-separation"
  );
  expect(
    protocol.evidence_classification.historical_d2 === "visible-development-evidence" &&
      protocol.evidence_classification.post_correction_evaluation === "development-only-diagnostic-evidence" &&
      protocol.evidence_classification.six_person_simulation === "simulated-process-assurance" &&
      protocol.evidence_classification.deterministic_tests_and_artifacts === "engineering-assurance" &&
      protocol.evidence_classification.human_independence === "absent" &&
      protocol.evidence_classification.unseen_holdout === "absent" &&
      protocol.evidence_classification.release_decision === "awaiting-real-solo-maintainer-approval",
    "evidence-classification"
  );
  expect(
    isDeepStrictEqual(protocol.risk_policy.required_waiver_risk_ids, WAIVER_RISK_IDS) &&
      protocol.risk_policy.accepted_is_not_resolved === true &&
      protocol.risk_policy.unknown_never_converted_to_pass === true &&
      protocol.risk_policy.known_product_integrity_or_security_defect_waivable === false,
    "risk-policy"
  );
  expect(
    protocol.release_action.authorized === false &&
      protocol.release_action.release_occurred === false &&
      protocol.release_action.version_change_authorized === false,
    "no-release-action"
  );
  expect(
    protocol.v1_meaning.stability_and_packaging_commitment === true &&
      protocol.v1_meaning.advisory_tool === true &&
      protocol.v1_meaning.perfect_ranking_accuracy_claim === false &&
      protocol.v1_meaning.independently_validated_accuracy_claim === false,
    "v1-meaning"
  );
  expect(
    protocol.readiness.unknown_risk_remains_unknown === true &&
      protocol.readiness.accepted_risk_never_becomes_resolved_or_passing === true,
    "readiness-risk-boundary"
  );
  validateEvidenceBindings(protocol.evidence_bindings, repoRoot);
  return true;
}

export function validateRiskLedger(ledger, protocol) {
  expectPlainRecord(ledger, "risk ledger");
  expectExactKeys(ledger, [
    "nonwaivable_categories", "records", "schema", "status", "version"
  ], "risk-ledger");
  expect(
    ledger.schema === RISK_LEDGER_SCHEMA &&
      ledger.version === 1 &&
      ledger.status === "frozen-awaiting-solo-maintainer-risk-decision",
    "risk-ledger-identity"
  );
  expect(
    isDeepStrictEqual(ledger.nonwaivable_categories, [
      "product-integrity", "containment", "security", "data-loss",
      "packaging", "future-maintenance-obligations"
    ]),
    "nonwaivable-categories"
  );
  expect(
    isDeepStrictEqual(ledger.records.map((record) => record.id), RISK_IDS),
    "risk-ledger-inventory"
  );
  const evidence = new Map(
    protocol.evidence_bindings.map((binding) => [binding.id, binding.sha256])
  );
  for (const record of ledger.records) {
    expectPlainRecord(record, `risk-${record.id}`);
    expectExactKeys(record, [
      "classification", "claim_restriction", "evidence_commitments", "id",
      "mitigation_already_present", "residual_risk", "resolution_status",
      "review_trigger", "severity", "title", "user_impact", "waived",
      "waiver_eligible", "waiver_rationale"
    ], `risk-${record.id}`);
    expect(["Known", "Likely", "Unknown"].includes(record.classification), `risk-classification-${record.id}`);
    expect(["P0", "P1", "P2"].includes(record.severity), `risk-severity-${record.id}`);
    expect(record.waived === false && record.resolution_status === "open", `risk-not-resolved-${record.id}`);
    expect(record.waiver_eligible === WAIVER_RISK_IDS.includes(record.id), `risk-waiver-policy-${record.id}`);
    expect(!(record.severity === "P0" && record.waiver_eligible), `risk-p0-not-waivable-${record.id}`);
    for (const key of [
      "title", "user_impact", "mitigation_already_present", "residual_risk",
      "waiver_rationale", "review_trigger", "claim_restriction"
    ]) {
      expect(typeof record[key] === "string" && record[key].trim().length > 0, `risk-field-${record.id}-${key}`);
    }
    expect(Array.isArray(record.evidence_commitments) && record.evidence_commitments.length > 0, `risk-evidence-${record.id}`);
    for (const commitment of record.evidence_commitments) {
      expectExactKeys(commitment, ["id", "sha256"], `risk-evidence-${record.id}`);
      expect(
        HASH.test(commitment.sha256) &&
          evidence.get(commitment.id) === commitment.sha256,
        `risk-exact-evidence-${record.id}`
      );
    }
  }
  expect(
    ledger.records.find((record) => record.id === "RISK-LABEL-VALIDITY").classification === "Unknown" &&
      ledger.records.find((record) => record.id === "RISK-GENERALIZATION").classification === "Unknown" &&
      ledger.records.find((record) => record.id === "RISK-NATIVE-WINDOWS-LINUX").classification === "Unknown",
    "unknown-risks-remain-unknown"
  );
  return true;
}

export function validateWaiver(waiver, protocolSha256, ledgerSha256, protocol, ledger) {
  expectPlainRecord(waiver, "waiver");
  expectExactKeys(waiver, [
    "accepted_risk_ids", "acknowledgments", "approval_timestamp_utc",
    "artifact_sha256", "authenticity", "candidate_source_commit", "decision",
    "failed_gates_called_passing", "maintainer_identity", "protocol_sha256",
    "release_action_occurred", "risk_ledger_sha256", "schema", "signature",
    "standard_and_ledger_frozen_before_signature", "status", "version"
  ], "waiver");
  expect(waiver.schema === WAIVER_SCHEMA && waiver.version === 1, "waiver-identity");
  expect(
    protocol.status === "frozen-awaiting-solo-maintainer-approval" &&
      ledger.status === "frozen-awaiting-solo-maintainer-risk-decision",
    "waiver-standard-ledger-frozen"
  );
  if (waiver.status === "awaiting-solo-maintainer-signature") {
    validateUnsignedWaiver(waiver);
    return "awaiting";
  }
  expect(waiver.status === "signed", "waiver-status");
  return validateSignedWaiver(waiver, protocolSha256, ledgerSha256);
}

export function validateUnsignedWaiver(waiver) {
  for (const key of [
    "approval_timestamp_utc", "artifact_sha256", "authenticity",
    "candidate_source_commit", "decision", "maintainer_identity",
    "protocol_sha256", "risk_ledger_sha256", "signature",
    "standard_and_ledger_frozen_before_signature"
  ]) {
    expect(waiver[key] === null, `unsigned-waiver-${key}`);
  }
  expect(
    Array.isArray(waiver.accepted_risk_ids) &&
      waiver.accepted_risk_ids.length === 0 &&
      Array.isArray(waiver.failed_gates_called_passing) &&
      waiver.failed_gates_called_passing.length === 0 &&
      waiver.release_action_occurred === false,
    "unsigned-waiver-empty"
  );
  expectExactKeys(waiver.acknowledgments, ACKNOWLEDGMENTS, "waiver-acknowledgments");
  expect(ACKNOWLEDGMENTS.every((key) => waiver.acknowledgments[key] === false), "unsigned-waiver-acknowledgments");
  return true;
}

export function validateSignedWaiver(waiver, protocolSha256, ledgerSha256) {
  validateSignedWaiverBindings(waiver, protocolSha256, ledgerSha256);
  expect(waiver.standard_and_ledger_frozen_before_signature === true, "signed-waiver-after-freeze");
  expect(waiver.release_action_occurred === false, "signed-waiver-no-release-action");
  expect(
    Array.isArray(waiver.failed_gates_called_passing) &&
      waiver.failed_gates_called_passing.length === 0,
    "signed-waiver-no-failed-gate-called-passing"
  );
  validateHumanIdentity(waiver.maintainer_identity);
  expectPlainRecord(waiver.authenticity, "waiver authenticity");
  expectExactKeys(waiver.authenticity, ["confirmed_out_of_band", "method"], "waiver-authenticity");
  expect(
    waiver.authenticity.confirmed_out_of_band === true &&
      waiver.authenticity.method === "manual-out-of-band-human-authentication",
    "authentic-human-confirmation"
  );
  expect(
    typeof waiver.approval_timestamp_utc === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(waiver.approval_timestamp_utc) &&
      Number.isFinite(Date.parse(waiver.approval_timestamp_utc)),
    "signed-waiver-utc-timestamp"
  );
  expectExactKeys(waiver.acknowledgments, ACKNOWLEDGMENTS, "waiver-acknowledgments");
  expect(ACKNOWLEDGMENTS.every((key) => waiver.acknowledgments[key] === true), "signed-waiver-acknowledgments");
  expect(
    typeof waiver.signature === "string" &&
      waiver.signature.trim().length >= 3 &&
      !PLACEHOLDER_OR_NONHUMAN.test(waiver.signature),
    "signed-waiver-signature"
  );
  expect(["proceed", "decline"].includes(waiver.decision), "signed-waiver-decision");
  validateRiskAcceptance(waiver.accepted_risk_ids, waiver.decision);
  if (waiver.decision === "proceed") {
    return "authenticated-proceed";
  }
  return "authenticated-decline";
}

export function validateSignedWaiverBindings(waiver, protocolSha256, ledgerSha256) {
  expect(
    waiver.protocol_sha256 === protocolSha256 &&
      waiver.risk_ledger_sha256 === ledgerSha256 &&
      waiver.candidate_source_commit === CANDIDATE_SOURCE_COMMIT &&
      waiver.artifact_sha256 === PRODUCTION_ARTIFACT_SHA256,
    "signed-waiver-bindings"
  );
  return true;
}

export function validateHumanIdentity(identityRecord) {
  expectPlainRecord(identityRecord, "maintainer identity");
  expectExactKeys(identityRecord, ["accountable_identity", "identity_type"], "maintainer-identity");
  const identity = identityRecord.accountable_identity;
  expect(
    identityRecord.identity_type === "real-human-solo-maintainer" &&
      typeof identity === "string" &&
      identity.trim().length >= 3 &&
      !PLACEHOLDER_OR_NONHUMAN.test(identity),
    "authentic-human-identity"
  );
  return true;
}

export function validateRiskAcceptance(riskIds, decision) {
  expect(["proceed", "decline"].includes(decision), "risk-acceptance-decision");
  if (decision === "proceed") {
    expect(isDeepStrictEqual(riskIds, WAIVER_RISK_IDS), "signed-waiver-all-risks");
    return true;
  }
  expect(Array.isArray(riskIds) && riskIds.length === 0, "declined-waiver-no-accepted-risks");
  return true;
}

export function deriveMaintainerConclusion(gateStates, approval) {
  expectPlainRecord(gateStates, "gate states");
  const mechanical = GATE_IDS.filter((id) => id !== "authentic-solo-maintainer-approval");
  expectExactKeys(gateStates, mechanical, "gate-states");
  expect(
    Object.values(gateStates).every((state) => ["pass", "fail", "unknown"].includes(state)),
    "gate-state-vocabulary"
  );
  if (Object.values(gateStates).includes("unknown")) {
    return "maintainer-certification-inconclusive";
  }
  if (Object.values(gateStates).includes("fail")) {
    return "maintainer-certification-not-ready";
  }
  if (approval === "authenticated-proceed") {
    return "maintainer-certification-ready";
  }
  expect(["awaiting", "authenticated-decline"].includes(approval), "approval-state");
  return "maintainer-certification-not-ready";
}

export function validatePublicClaims(claims, protocol) {
  expect(Array.isArray(claims), "public-claims-array");
  expect(new Set(claims).size === claims.length, "public-claims-unique");
  expect(
    claims.every((claim) => protocol.claim_boundary.permitted.includes(claim)) &&
      claims.every((claim) => !protocol.claim_boundary.forbidden.includes(claim)),
    "public-claim-boundary"
  );
  return true;
}

export function assertMaintainerPath(relativePath) {
  expect(
    typeof relativePath === "string" &&
      relativePath.startsWith(`${MAINTAINER_ROOT}/`) &&
      !relativePath.includes("..") &&
      !path.isAbsolute(relativePath),
    "namespace-separation"
  );
  return true;
}

function validateEvidenceBindings(bindings, repoRoot) {
  expect(Array.isArray(bindings) && bindings.length === EXPECTED_EVIDENCE.length, "evidence-binding-count");
  for (let index = 0; index < EXPECTED_EVIDENCE.length; index += 1) {
    const [id, relative, digest] = EXPECTED_EVIDENCE[index];
    const binding = bindings[index];
    expect(
      binding.id === id &&
        binding.path === relative &&
        binding.sha256 === digest &&
        typeof binding.classification === "string" &&
        binding.classification.length > 0,
      `evidence-binding-${id}`
    );
    assertContainedFile(repoRoot, relative, digest);
    if (id === "simulation-evidence-tree") {
      expect(
        binding.semantic_sha256 ===
          "42f36e5fea80a84523995c5b394bcb8c4fc5b300a39b763d14277408cff96dc5",
        "simulation-semantic-tree-binding"
      );
    } else {
      expect(!Object.hasOwn(binding, "semantic_sha256"), `evidence-extra-semantic-${id}`);
    }
  }
}

function validateRepositoryBindings(repoRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"));
  const sourceVersion = fs.readFileSync(path.join(repoRoot, "src/version.js"), "utf8");
  expect(
    manifest.version === PACKAGE_VERSION &&
      lock.version === PACKAGE_VERSION &&
      lock.packages?.[""]?.version === PACKAGE_VERSION &&
      sourceVersion.includes(`VERSION = "${PACKAGE_VERSION}"`),
    "package-version-consistency"
  );
  for (const key of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    expect(Object.keys(manifest[key] || {}).length === 0, `zero-${key}`);
    expect(Object.keys(lock.packages?.[""]?.[key] || {}).length === 0, `lock-zero-${key}`);
  }
  assertContainedFile(repoRoot, "src/v1/build-metadata.json", PUBLIC_CAPABILITIES_SHA256);
}

function validateSchema(schema) {
  expectPlainRecord(schema, "schema");
  expect(
    schema.$id === "kanon-v1.0.0-maintainer-assurance-bundle-v1" &&
      schema.$schema === "https://json-schema.org/draft/2020-12/schema",
    "schema-identity"
  );
  expectPlainRecord(schema.$defs, "schema definitions");
  expectExactKeys(schema.$defs, ["hash", "protocol", "risk_ledger", "risk_record", "waiver"], "schema-definitions");
  for (const key of ["protocol", "risk_ledger", "risk_record", "waiver"]) {
    expect(schema.$defs[key].additionalProperties === false, `schema-strict-${key}`);
  }
}

function assertContainedFile(repoRoot, relative, digest) {
  const resolved = path.resolve(repoRoot, relative);
  expect(
    resolved.startsWith(`${repoRoot}${path.sep}`) &&
      fs.lstatSync(resolved).isFile() &&
      !fs.lstatSync(resolved).isSymbolicLink() &&
      sha256(fs.readFileSync(resolved)) === digest,
    `exact-evidence-${relative}`
  );
}

function expectExactKeys(value, keys, label) {
  expectPlainRecord(value, label);
  expect(
    isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort()),
    `${label}-exact-keys`
  );
}

function expectPlainRecord(value, label) {
  expect(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
    `${label}-plain-record`
  );
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(`maintainer-assurance: ${label}`);
  }
}
