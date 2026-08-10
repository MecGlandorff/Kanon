import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import {
  GATE_IDS,
  RISK_IDS,
  WAIVER_RISK_IDS,
  deriveMaintainerConclusion,
  loadCanonicalJson,
  validateRiskLedger,
  validateWaiver
} from "../../v1.0.0-maintainer/lib/validator.js";
import {
  publicSkillFiles,
  stableRuntimeArtifacts
} from "../../../scripts/lib/artifact-files.js";
import {
  canonicalJson,
  sha256
} from "../../../scripts/lib/v1-prospective-release.js";

export const CERTIFICATION_ROOT = "eval/v1.0.0-maintainer-certification";
export const TRANSITION_RELATIVE = `${CERTIFICATION_ROOT}/TRANSITION.json`;
export const RESPONSIBILITIES_RELATIVE =
  `${CERTIFICATION_ROOT}/TEST-RESPONSIBILITIES.json`;
export const TRANSITION_SHA256 =
  "629f4e3c7644f0756b2ce5c11f6d7fcb60a2c2f946249d6971c1a0fc042fa7c6";
export const CORRECTED_README_SHA256 =
  "b478e96f645b54183f0392d31bed9a81037ee4c2fb0e4dcd464961cd55ab2358";
export const CURRENT_PACKAGE_SHA256 =
  "d8c5bbf8018307efbd2330b1395228f5bbbb85ea2d54cf48f020e9c75f4760f3";
export const CERTIFICATION_RECORD_SCHEMA =
  "kanon-v1.0.0-maintainer-certification-record-v1";
export const CERTIFICATION_RUN_SCHEMA =
  "kanon-v1.0.0-maintainer-certification-run-v1";
export const CERTIFICATION_TREE_SCHEMA =
  "kanon-v1.0.0-maintainer-certification-tree-v1";

const HISTORICAL_COMMIT = "4a0e232e82cbb355416d835c290c65b7c628740c";
const STANDARD_FREEZE_COMMIT = "a9d8cfb4c0f652012a52d7fefc9ee4287377f77c";
const PRODUCTION_ARTIFACT_SHA256 =
  "0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9";
const PUBLIC_CAPABILITIES_SHA256 =
  "bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf";
const PACKAGE_VERSION = "0.4.0-rc.1";
const HISTORICAL_PACKAGE_SHA256 =
  "d8c5bbf8018307efbd2330b1395228f5bbbb85ea2d54cf48f020e9c75f4760f3";
const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

const FROZEN_FILES = Object.freeze({
  "docs/v1-run-maintainer-assurance-freeze.md":
    "75549cf5960b6827943738392a7a55083d4e7f2a65cef3aff81e38f0de26b9dd",
  "eval/v1.0.0-maintainer/PROTOCOL.md":
    "fff8469b95deaec58a51acbc43a0f3a9cc25da89f300913f7ecc189c2b151f48",
  "eval/v1.0.0-maintainer/PROTOCOL.json":
    "635a08e4058407624fdb1779f1b4127a9e8d821dc50386dbae61fd39b2844092",
  "eval/v1.0.0-maintainer/RISK_LEDGER.json":
    "838351cad051c13c0316f169ee30630d131292cf8061de0a25234376894167e7",
  "eval/v1.0.0-maintainer/WAIVER.template.json":
    "02ebb739dafad9fbbc5b994904432847e7c60c0de8548a68708d6efd87aff2de",
  "eval/v1.0.0-maintainer/lib/validator.js":
    "deaac7167a931d4ea3b4ffe59d4c6bad6f9b875c036a664e118952cb6273df3e",
  "eval/v1.0.0-maintainer/schema.json":
    "801c46596f9e0714a4b4ab75039bf0205a698663f530b6ff488b777733ac72db"
});

const DOCUMENTATION_GATE =
  "accurate-readme-changelog-installation-compatibility-security-and-limitations";
const UNKNOWN_RISKS = Object.freeze([
  "RISK-LABEL-VALIDITY",
  "RISK-GENERALIZATION",
  "RISK-NATIVE-WINDOWS-LINUX"
]);
const CERTIFICATION_BOUNDARIES = Object.freeze({
  evidence_strict_release_supported: false,
  holdout_performance_established: false,
  independence_established: false,
  next_permissible_action:
    "separately-authorized-principal-level-release-hardening-and-exact-v1.0.0-candidate-preparation",
  publication_authorized: false,
  release_action_occurred: false
});

export function validateTransitionAuthority(repoRoot) {
  const root = path.resolve(repoRoot);
  const loaded = loadCanonical(root, TRANSITION_RELATIVE, 128 * 1024);
  expect(loaded.sha256 === TRANSITION_SHA256, "transition-hash");
  validateTransitionValue(loaded.value);
  return { ...loaded, transition: loaded.value };
}

export function validateTransitionValue(transition) {
  expectExactKeys(transition, [
    "bindings",
    "certification_gates",
    "documentation_correction",
    "historical_interpretation",
    "namespace",
    "preservation",
    "schema",
    "status",
    "version"
  ], "transition");
  expect(
    transition.schema ===
      "kanon-v1.0.0-maintainer-documentation-transition-v1" &&
      transition.version === 1 &&
      transition.status === "frozen-before-live-documentation-repair" &&
      transition.namespace === CERTIFICATION_ROOT,
    "transition-identity"
  );
  expect(
    isDeepStrictEqual(transition.certification_gates, GATE_IDS),
    "transition-gates"
  );
  expect(
    transition.bindings.maintainer_protocol.sha256 ===
      "635a08e4058407624fdb1779f1b4127a9e8d821dc50386dbae61fd39b2844092" &&
      transition.bindings.risk_ledger.sha256 ===
        "838351cad051c13c0316f169ee30630d131292cf8061de0a25234376894167e7" &&
      transition.bindings.signed_waiver.sha256 ===
        "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6" &&
      transition.bindings.historical_readme.sha256 ===
        "ace87f1ea57c9eea2792f37a060581d74cb72c73fe1c61eac94f8aae38c86169" &&
      transition.bindings.historical_freeze_record.sha256 ===
        "75549cf5960b6827943738392a7a55083d4e7f2a65cef3aff81e38f0de26b9dd" &&
      transition.bindings.canonical_capabilities.sha256 ===
        PUBLIC_CAPABILITIES_SHA256 &&
      transition.bindings.production_artifact.sha256 ===
        PRODUCTION_ARTIFACT_SHA256,
    "transition-exact-bindings"
  );
  expect(
    transition.documentation_correction.before_sha256 ===
      "ace87f1ea57c9eea2792f37a060581d74cb72c73fe1c61eac94f8aae38c86169" &&
      transition.documentation_correction.after_sha256 ===
        CORRECTED_README_SHA256 &&
      transition.documentation_correction.path === "README.md" &&
      transition.documentation_correction.only_permitted_live_documentation_edit ===
        true,
    "transition-documentation-scope"
  );
  expect(
    transition.historical_interpretation.historical_documentation_gate ===
      "fail" &&
      transition.historical_interpretation.historical_result ===
        "maintainer-certification-not-ready" &&
      transition.historical_interpretation
        .previous_documentation_gate_must_not_be_relabelled_passing === true &&
      transition.historical_interpretation
        .new_versioned_certification_must_evaluate_current_live_documentation ===
        true,
    "transition-historical-boundary"
  );
  expect(
    Object.values(transition.preservation).every((value) =>
      value === false || value === true
    ) &&
      transition.preservation.maintainer_standard_and_freeze_remain_immutable ===
        true &&
      Object.entries(transition.preservation)
        .filter(([key]) => key !== "maintainer_standard_and_freeze_remain_immutable")
        .every(([, value]) => value === false),
    "transition-preservation"
  );
  return true;
}

export function validateHistoricalState(repoRoot, suppliedTransition) {
  const root = path.resolve(repoRoot);
  const transition =
    suppliedTransition || validateTransitionAuthority(root).transition;
  for (const [relative, digest] of Object.entries(FROZEN_FILES)) {
    expect(
      sha256(readBoundedRegularFile(root, relative, 4 * 1024 * 1024)) ===
        digest,
      `frozen-file-${relative}`
    );
  }

  const protocol = loadCanonical(
    root,
    "eval/v1.0.0-maintainer/PROTOCOL.json"
  );
  const ledger = loadCanonical(
    root,
    "eval/v1.0.0-maintainer/RISK_LEDGER.json"
  );
  expect(
    protocol.sha256 === transition.bindings.maintainer_protocol.sha256,
    "historical-protocol-binding"
  );
  expect(
    ledger.sha256 === transition.bindings.risk_ledger.sha256,
    "historical-ledger-binding"
  );
  validateRiskLedger(ledger.value, protocol.value);

  for (const binding of protocol.value.evidence_bindings) {
    const historicalPath =
      binding.id === "public-readme" || binding.id === "package-metadata";
    const bytes = historicalPath
      ? gitBlob(root, HISTORICAL_COMMIT, binding.path)
      : readBoundedRegularFile(root, binding.path, 256 * 1024 * 1024);
    expect(sha256(bytes) === binding.sha256, `historical-evidence-${binding.id}`);
  }

  const historicalReadme = gitBlob(root, HISTORICAL_COMMIT, "README.md");
  const historicalPackage = gitBlob(root, HISTORICAL_COMMIT, "package.json");
  const historicalTest = gitBlob(
    root,
    HISTORICAL_COMMIT,
    "test/v1-maintainer-assurance.test.js"
  );
  const historicalFreeze = gitBlob(
    root,
    HISTORICAL_COMMIT,
    "docs/v1-run-maintainer-assurance-freeze.md"
  );
  expect(
    sha256(historicalReadme) ===
      transition.bindings.historical_readme.sha256,
    "historical-readme"
  );
  expect(
    sha256(historicalPackage) === HISTORICAL_PACKAGE_SHA256,
    "historical-package"
  );
  expect(
    sha256(historicalTest) ===
      "ade10a090d10e39dcf9f1d410b8695cba10309da60c9a727e1d719cba9d26c96",
    "historical-maintainer-test"
  );
  expect(
    sha256(historicalFreeze) ===
      transition.bindings.historical_freeze_record.sha256 &&
      historicalFreeze
        .toString("utf8")
        .includes("maintainer-certification-not-ready"),
    "historical-not-ready-freeze"
  );
  return {
    historicalPackage,
    historicalReadme,
    ledger: ledger.value,
    protocol: protocol.value
  };
}

export function loadHistoricalMaintainerBundle(repoRoot) {
  const root = path.resolve(repoRoot);
  const transition = validateTransitionAuthority(root).transition;
  const historical = validateHistoricalState(root, transition);
  const protocol = loadCanonical(
    root,
    "eval/v1.0.0-maintainer/PROTOCOL.json"
  );
  const ledger = loadCanonical(
    root,
    "eval/v1.0.0-maintainer/RISK_LEDGER.json"
  );
  const schema = loadCanonical(
    root,
    "eval/v1.0.0-maintainer/schema.json"
  );
  const waiver = loadCanonical(
    root,
    "eval/v1.0.0-maintainer/WAIVER.template.json"
  );
  const approval = validateWaiver(
    waiver.value,
    protocol.sha256,
    ledger.sha256,
    historical.protocol,
    historical.ledger
  );
  expect(approval === "awaiting", "historical-template-awaiting");
  return {
    approval,
    hashes: {
      protocol: protocol.sha256,
      risk_ledger: ledger.sha256,
      schema: schema.sha256,
      waiver: waiver.sha256
    },
    ledger: historical.ledger,
    protocol: historical.protocol,
    waiver: waiver.value
  };
}

export function validateSignedMaintainerWaiver(
  repoRoot,
  suppliedHistorical,
  suppliedTransition
) {
  const root = path.resolve(repoRoot);
  const transition =
    suppliedTransition || validateTransitionAuthority(root).transition;
  const historical =
    suppliedHistorical || validateHistoricalState(root, transition);
  const protocol = loadCanonical(
    root,
    "eval/v1.0.0-maintainer/PROTOCOL.json"
  );
  const ledger = loadCanonical(
    root,
    "eval/v1.0.0-maintainer/RISK_LEDGER.json"
  );
  const waiver = loadCanonical(
    root,
    "eval/v1.0.0-maintainer/WAIVER.json",
    64 * 1024
  );
  expect(
    waiver.sha256 === transition.bindings.signed_waiver.sha256,
    "signed-waiver-hash"
  );
  const approval = validateWaiver(
    waiver.value,
    protocol.sha256,
    ledger.sha256,
    historical.protocol,
    historical.ledger
  );
  expect(approval === "authenticated-proceed", "signed-waiver-result");
  const freezeTimestamp = Date.parse(
    gitText(root, [
      "show",
      "-s",
      "--format=%cI",
      STANDARD_FREEZE_COMMIT
    ]).trim()
  );
  const approvalTimestamp = Date.parse(waiver.value.approval_timestamp_utc);
  expect(
    Number.isFinite(freezeTimestamp) &&
      Number.isFinite(approvalTimestamp) &&
      approvalTimestamp > freezeTimestamp,
    "signed-waiver-after-standard-freeze"
  );
  return { approval, waiver: waiver.value, waiver_sha256: waiver.sha256 };
}

export function validateLiveDocumentation(
  repoRoot,
  suppliedHistorical,
  suppliedTransition
) {
  const root = path.resolve(repoRoot);
  const transition =
    suppliedTransition || validateTransitionAuthority(root).transition;
  const historical =
    suppliedHistorical || validateHistoricalState(root, transition);
  const correction = transition.documentation_correction;
  const liveBytes = readBoundedRegularFile(root, correction.path, 1024 * 1024);
  const live = liveBytes.toString("utf8");
  expect(sha256(liveBytes) === correction.after_sha256, "live-readme-hash");
  const expected = applyAuthorizedReadmeCorrection(
    historical.historicalReadme.toString("utf8"),
    correction
  );
  expect(live === expected, "live-readme-exact-authorized-correction");

  const metadataBytes = readBoundedRegularFile(
    root,
    transition.bindings.canonical_capabilities.path,
    1024 * 1024
  );
  expect(
    sha256(metadataBytes) === PUBLIC_CAPABILITIES_SHA256,
    "live-public-capabilities"
  );
  const metadata = JSON.parse(metadataBytes.toString("utf8"));
  const canonicalStable = metadata.public_capabilities.skills.filter(
    (skill) => skill !== "kanon"
  );
  expect(
    canonicalStable.length === 6 &&
      new Set(canonicalStable).size === 6 &&
      isDeepStrictEqual(
        new Set(canonicalStable),
        new Set(correction.stable_skill_order)
      ),
    "live-six-canonical-stable-skills"
  );

  const packagedBytes = readBoundedRegularFile(
    root,
    transition.bindings.packaged_readme.path,
    1024 * 1024
  );
  expect(
    sha256(packagedBytes) === transition.bindings.packaged_readme.sha256,
    "packaged-readme-unchanged"
  );
  const packaged = packagedBytes.toString("utf8");
  const packagedDeclaration = packaged.match(/stable ([\s\S]*?)\n  skills;/u);
  expect(Boolean(packagedDeclaration), "packaged-stable-declaration");
  const packagedOrder = Array.from(
    packagedDeclaration[1].matchAll(/`([^`]+)`/gu),
    (match) => match[1]
  );
  expect(
    isDeepStrictEqual(packagedOrder, correction.stable_skill_order),
    "packaged-stable-order"
  );
  expect(
    /Compatibility wrappers\s+remain limited to/u.test(packaged) &&
      packaged.includes("advisory notice mode") &&
      packaged.includes("Enforcement is false"),
    "packaged-claim-boundary"
  );

  const sectionStart = live.indexOf(correction.transformation.replacement_heading);
  const sectionEnd = live.indexOf(correction.transformation.end_marker, sectionStart);
  expect(sectionStart >= 0 && sectionEnd > sectionStart, "live-stable-section");
  const rows = live
    .slice(sectionStart, sectionEnd)
    .split("\n")
    .map((line) => line.match(/^\| `([^`]+)` \| (.+) \|$/u))
    .filter(Boolean)
    .map((match) => ({ description: match[2], name: match[1] }));
  expect(
    isDeepStrictEqual(
      rows,
      correction.stable_skill_descriptions.map(({ description, name }) => ({
        description,
        name
      }))
    ),
    "live-stable-table"
  );
  for (const item of correction.stable_skill_descriptions) {
    const skill = readBoundedRegularFile(root, item.source, 256 * 1024)
      .toString("utf8")
      .match(/^description: "([^"]+)"$/mu);
    expect(Boolean(skill) && skill[1] === item.description, `skill-description-${item.name}`);
  }
  expect(
    live.indexOf("The v0.4 compatibility workflows remain:", sectionEnd) >
      sectionEnd &&
      !live.includes("exposes four stable") &&
      rows.length === 6,
    "live-compatibility-separation-and-count"
  );
  expect(
    live.includes("development and regression data") &&
      live.includes("results are in-sample") &&
      /not presented as performance on unseen\s+repositories/u.test(live) &&
      /currently makes no claim that it improves\s+Codex precision or recall/u.test(live) &&
      live.includes("enforcement is false"),
    "live-limitations-and-advisory-boundary"
  );
  return {
    corrected_readme_sha256: sha256(liveBytes),
    historical_gate: "fail",
    stable_skills: rows.map((row) => row.name),
    status: "pass"
  };
}

export function validateCurrentProductState(repoRoot) {
  const root = path.resolve(repoRoot);
  const packageBytes = readBoundedRegularFile(root, "package.json", 256 * 1024);
  expect(sha256(packageBytes) === CURRENT_PACKAGE_SHA256, "current-package-hash");
  const manifest = JSON.parse(packageBytes.toString("utf8"));
  const lockBytes = readBoundedRegularFile(root, "package-lock.json", 4 * 1024 * 1024);
  expect(
    sha256(lockBytes) ===
      "d540c58992283c0773d5e4c74590085678dfab798a5bbafcb93593c656ac89cc",
    "current-lock-hash"
  );
  const lock = JSON.parse(lockBytes.toString("utf8"));
  const sourceVersion = readBoundedRegularFile(
    root,
    "src/version.js",
    256 * 1024
  ).toString("utf8");
  expect(
    manifest.version === PACKAGE_VERSION &&
      lock.version === PACKAGE_VERSION &&
      lock.packages?.[""]?.version === PACKAGE_VERSION &&
      sourceVersion.includes(`VERSION = "${PACKAGE_VERSION}"`),
    "current-version"
  );
  for (const key of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies"
  ]) {
    expect(Object.keys(manifest[key] || {}).length === 0, `current-zero-${key}`);
    expect(
      Object.keys(lock.packages?.[""]?.[key] || {}).length === 0,
      `current-lock-zero-${key}`
    );
  }
  expect(
    sha256(
      readBoundedRegularFile(root, "src/v1/build-metadata.json", 1024 * 1024)
    ) === PUBLIC_CAPABILITIES_SHA256,
    "current-capability-hash"
  );

  const runtimePairs = stableRuntimeArtifacts(root);
  for (const [source, generated] of runtimePairs) {
    expect(
      readBoundedRegularFile(root, source, 4 * 1024 * 1024).equals(
        readBoundedRegularFile(root, generated, 4 * 1024 * 1024)
      ),
      `generated-synchronization-${generated}`
    );
  }
  const packaged = publicSkillFiles(root);
  expect(
    packaged.every(
      (relative) =>
        !relative.startsWith(`${CERTIFICATION_ROOT}/`) &&
        !relative.startsWith("test/") &&
        relative !== "scripts/run-tests.js"
    ),
    "certification-excluded-from-product"
  );
  return {
    generated_runtime_delta: 0,
    package_inventory_count: packaged.length + 5,
    package_version: manifest.version,
    public_capabilities_sha256: PUBLIC_CAPABILITIES_SHA256,
    runtime_pair_count: runtimePairs.length
  };
}

export function deriveLiveMaintainerCertification(repoRoot, gateStates) {
  const root = path.resolve(repoRoot);
  const transition = validateTransitionAuthority(root).transition;
  const historical = validateHistoricalState(root, transition);
  const approval = validateSignedMaintainerWaiver(
    root,
    historical,
    transition
  );
  const documentation = validateLiveDocumentation(
    root,
    historical,
    transition
  );
  const product = validateCurrentProductState(root);
  const mechanical = GATE_IDS.filter(
    (id) => id !== "authentic-solo-maintainer-approval"
  );
  expectPlainRecord(gateStates, "live-gate-states");
  expect(
    isDeepStrictEqual(Object.keys(gateStates).sort(), [...mechanical].sort()),
    "live-gate-inventory"
  );
  expect(
    Object.values(gateStates).every((state) =>
      ["pass", "fail", "unknown"].includes(state)
    ),
    "live-gate-vocabulary"
  );
  expect(
    gateStates[DOCUMENTATION_GATE] === documentation.status,
    "live-documentation-gate-current-evidence"
  );
  const result = deriveMaintainerConclusion(gateStates, approval.approval);
  return {
    approval: approval.approval,
    documentation,
    product,
    result,
    risk_state: deriveRiskState(
      historical.ledger,
      approval.waiver,
      documentation.status
    )
  };
}

export function validateCertificationRecord(repoRoot, record) {
  const root = path.resolve(repoRoot);
  expectExactKeys(record, [
    "bindings",
    "boundaries",
    "gate_results",
    "result",
    "risk_state",
    "schema",
    "status",
    "version"
  ], "certification-record");
  expect(
    record.schema === CERTIFICATION_RECORD_SCHEMA &&
      record.version === 1 &&
      record.status === "final-maintainer-certification",
    "certification-record-identity"
  );
  expect(
    isDeepStrictEqual(record.boundaries, CERTIFICATION_BOUNDARIES),
    "certification-boundaries"
  );
  expect(
    Array.isArray(record.gate_results) &&
      isDeepStrictEqual(
        record.gate_results.map((gate) => gate.id),
        GATE_IDS
      ) &&
      record.gate_results.every(
        (gate) =>
          isDeepStrictEqual(Object.keys(gate).sort(), ["id", "state"]) &&
          gate.state === "pass"
      ),
    "certification-gate-results"
  );
  const mechanical = Object.fromEntries(
    record.gate_results
      .filter((gate) => gate.id !== "authentic-solo-maintainer-approval")
      .map((gate) => [gate.id, gate.state])
  );
  const derived = deriveLiveMaintainerCertification(root, mechanical);
  expect(
    derived.result === "maintainer-certification-ready" &&
      record.result === derived.result,
    "certification-result"
  );
  expect(
    isDeepStrictEqual(record.risk_state, derived.risk_state),
    "certification-risk-state"
  );
  validateCertificationBindings(root, record.bindings);
  return derived;
}

export function validateCertificationRunRecord(repoRoot, run, certification) {
  const root = path.resolve(repoRoot);
  expectExactKeys(run, [
    "artifact",
    "bindings",
    "counts",
    "deltas",
    "dependencies",
    "environment",
    "gate_results",
    "historical_preservation",
    "release_action_occurred",
    "schema",
    "version"
  ], "certification-run");
  expect(
    run.schema === CERTIFICATION_RUN_SCHEMA &&
      run.version === 1 &&
      run.release_action_occurred === false,
    "certification-run-identity"
  );
  expect(
    run.artifact.byte_identical === true &&
      run.artifact.first_pack_sha256 === PRODUCTION_ARTIFACT_SHA256 &&
      run.artifact.second_pack_sha256 === PRODUCTION_ARTIFACT_SHA256 &&
      run.artifact.production_sha256 === PRODUCTION_ARTIFACT_SHA256 &&
      run.artifact.installed_path_contains_spaces === true &&
      run.artifact.installed_conformance.failed === 0 &&
      run.artifact.installed_conformance.passed > 0,
    "certification-run-artifact"
  );
  expect(
    run.dependencies.runtime === 0 &&
      run.dependencies.optional === 0 &&
      run.dependencies.peer === 0,
    "certification-run-dependencies"
  );
  for (const count of [run.counts.focused, run.counts.complete]) {
    expect(
      Number.isInteger(count.passed) &&
        count.passed > 0 &&
        count.failed === 0 &&
        Number.isInteger(count.skipped) &&
        count.skipped >= 0,
      "certification-run-counts"
    );
  }
  expect(
    run.deltas.production.files === 0 &&
      run.deltas.production.insertions === 0 &&
      run.deltas.production.deletions === 0 &&
      run.deltas.generated_runtime.files === 0 &&
      run.deltas.complexity.production_source_delta === 0 &&
      run.deltas.documentation.files === 1 &&
      run.deltas.evaluation.files > 0 &&
      run.deltas.test.files > 0,
    "certification-run-deltas"
  );
  expect(
    isDeepStrictEqual(run.gate_results, certification.gate_results),
    "certification-run-gates"
  );
  expect(
    run.historical_preservation.maintainer_protocol_sha256 ===
      "635a08e4058407624fdb1779f1b4127a9e8d821dc50386dbae61fd39b2844092" &&
      run.historical_preservation.risk_ledger_sha256 ===
        "838351cad051c13c0316f169ee30630d131292cf8061de0a25234376894167e7" &&
      run.historical_preservation.unsigned_template_sha256 ===
        "02ebb739dafad9fbbc5b994904432847e7c60c0de8548a68708d6efd87aff2de" &&
      run.historical_preservation.signed_waiver_sha256 ===
        "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6" &&
      run.historical_preservation.prospective_protocol_sha256 ===
        "254917b8a47a51f52d4af022dc7146a9f0755836242b1c491e6a0a583e0b8f73" &&
      run.historical_preservation.simulation_protocol_sha256 ===
        "c9c2b15361dd3a5f6284bc10972e2dc62e2ba2c8fcc19c55cc28475d441d2cc7" &&
      run.historical_preservation.simulation_specification_sha256 ===
        "8077343f989caf30e01072ee5bd207bf60ec49eafe500b246f4fc3da83d046e4",
    "certification-run-historical-preservation"
  );
  expect(
    run.bindings.certification_record_sha256 ===
      sha256(Buffer.from(`${canonicalJson(certification)}\n`)) &&
      run.bindings.transition_authority_sha256 === TRANSITION_SHA256 &&
      COMMIT.test(run.bindings.implementation_commit),
    "certification-run-bindings"
  );
  expect(
    typeof run.environment.node === "string" &&
      typeof run.environment.platform === "string" &&
      typeof run.environment.arch === "string",
    "certification-run-environment"
  );
  return true;
}

export function certificationEvidenceDirectories(repoRoot) {
  const root = path.resolve(repoRoot);
  const certificationRoot = path.join(root, CERTIFICATION_ROOT);
  return fs
    .readdirSync(certificationRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        /^evidence-sha256-[0-9a-f]{64}$/u.test(entry.name)
    )
    .map((entry) => path.join(certificationRoot, entry.name))
    .sort();
}

export function validateCertificationEvidence(repoRoot, evidenceDirectory) {
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(evidenceDirectory);
  expect(
    resolved.startsWith(`${path.join(root, CERTIFICATION_ROOT)}${path.sep}`),
    "certification-evidence-containment"
  );
  const stat = fs.lstatSync(resolved);
  expect(stat.isDirectory() && !stat.isSymbolicLink(), "certification-evidence-directory");
  expect(
    isDeepStrictEqual(fs.readdirSync(resolved).sort(), [
      "certification.json",
      "complete-tree-commitment.json",
      "run-record.json"
    ]),
    "certification-evidence-inventory"
  );
  const certification = loadCanonicalAbsolute(
    resolved,
    "certification.json",
    1024 * 1024
  );
  const run = loadCanonicalAbsolute(resolved, "run-record.json", 1024 * 1024);
  const tree = loadCanonicalAbsolute(
    resolved,
    "complete-tree-commitment.json",
    1024 * 1024
  );
  validateCertificationRecord(root, certification.value);
  validateCertificationRunRecord(root, run.value, certification.value);
  expectExactKeys(tree.value, [
    "files",
    "schema",
    "semantic_sha256",
    "version"
  ], "certification-tree");
  const files = [
    { path: "certification.json", sha256: certification.sha256 },
    { path: "run-record.json", sha256: run.sha256 }
  ];
  expect(
    tree.value.schema === CERTIFICATION_TREE_SCHEMA &&
      tree.value.version === 1 &&
      isDeepStrictEqual(tree.value.files, files),
    "certification-tree-files"
  );
  const semantic = sha256(
    Buffer.from(
      `${canonicalJson({
        files,
        schema: CERTIFICATION_TREE_SCHEMA,
        version: 1
      })}\n`
    )
  );
  expect(
    tree.value.semantic_sha256 === semantic &&
      path.basename(resolved) === `evidence-sha256-${semantic}`,
    "certification-semantic-tree"
  );
  return {
    certification: certification.value,
    evidence_tree_sha256: semantic,
    run: run.value
  };
}

export function applyAuthorizedReadmeCorrection(readme, correction) {
  const start = readme.indexOf(correction.transformation.start_marker);
  const end = readme.indexOf(correction.transformation.end_marker, start);
  expect(start >= 0 && end > start, "authorized-readme-markers");
  const descriptions = new Map(
    correction.stable_skill_descriptions.map((item) => [item.name, item])
  );
  const rows = correction.stable_skill_order.map((name) => {
    const item = descriptions.get(name);
    expect(Boolean(item), `authorized-readme-skill-${name}`);
    return `| \`${name}\` | ${item.description} |`;
  });
  const replacement = [
    correction.transformation.replacement_heading,
    "",
    "| Stable skill | Behavior |",
    "| --- | --- |",
    ...rows
  ].join("\n");
  return `${readme.slice(0, start)}${replacement}${readme.slice(end)}`;
}

function deriveRiskState(ledger, waiver, documentationStatus) {
  expect(documentationStatus === "pass", "risk-documentation-current-pass");
  expect(
    isDeepStrictEqual(
      ledger.records.map((record) => record.id),
      RISK_IDS
    ),
    "risk-ledger-exact"
  );
  expect(
    isDeepStrictEqual(waiver.accepted_risk_ids, WAIVER_RISK_IDS),
    "risk-accepted-exact"
  );
  expect(
    isDeepStrictEqual(
      ledger.records
        .filter((record) => record.classification === "Unknown")
        .map((record) => record.id),
      UNKNOWN_RISKS
    ),
    "risk-unknown-preserved"
  );
  return {
    accepted_is_not_resolved: true,
    accepted_open: [...WAIVER_RISK_IDS],
    open_nonwaivable: ["RISK-FUTURE-MAINTENANCE-OBLIGATIONS"],
    resolved_by_current_evidence: ["RISK-PUBLIC-DOCUMENTATION-DRIFT"],
    unknown: [...UNKNOWN_RISKS]
  };
}

function validateCertificationBindings(repoRoot, bindings) {
  expectExactKeys(bindings, [
    "corrected_readme_sha256",
    "historical_freeze_sha256",
    "historical_readme_sha256",
    "implementation_commit",
    "live_certification_test_sha256",
    "live_validator_sha256",
    "maintainer_protocol_sha256",
    "package_sha256",
    "production_artifact_sha256",
    "public_capabilities_sha256",
    "risk_ledger_sha256",
    "signed_waiver_sha256",
    "test_responsibility_sha256",
    "transition_authority_sha256"
  ], "certification-bindings");
  expect(
    bindings.corrected_readme_sha256 === CORRECTED_README_SHA256 &&
      bindings.historical_freeze_sha256 ===
        "75549cf5960b6827943738392a7a55083d4e7f2a65cef3aff81e38f0de26b9dd" &&
      bindings.historical_readme_sha256 ===
        "ace87f1ea57c9eea2792f37a060581d74cb72c73fe1c61eac94f8aae38c86169" &&
      bindings.maintainer_protocol_sha256 ===
        "635a08e4058407624fdb1779f1b4127a9e8d821dc50386dbae61fd39b2844092" &&
      bindings.package_sha256 === CURRENT_PACKAGE_SHA256 &&
      bindings.production_artifact_sha256 === PRODUCTION_ARTIFACT_SHA256 &&
      bindings.public_capabilities_sha256 === PUBLIC_CAPABILITIES_SHA256 &&
      bindings.risk_ledger_sha256 ===
        "838351cad051c13c0316f169ee30630d131292cf8061de0a25234376894167e7" &&
      bindings.signed_waiver_sha256 ===
        "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6" &&
      bindings.transition_authority_sha256 === TRANSITION_SHA256 &&
      COMMIT.test(bindings.implementation_commit),
    "certification-exact-bindings"
  );
  for (const [key, relative] of [
    ["live_validator_sha256", `${CERTIFICATION_ROOT}/lib/validator.js`],
    ["live_certification_test_sha256", "test/v1-maintainer-certification.test.js"],
    ["test_responsibility_sha256", RESPONSIBILITIES_RELATIVE]
  ]) {
    expect(
      HASH.test(bindings[key]) &&
        sha256(readBoundedRegularFile(repoRoot, relative, 4 * 1024 * 1024)) ===
          bindings[key] &&
        sha256(gitBlob(repoRoot, bindings.implementation_commit, relative)) ===
          bindings[key],
      `certification-implementation-${key}`
    );
  }
  expect(
    sha256(gitBlob(repoRoot, bindings.implementation_commit, "README.md")) ===
      CORRECTED_README_SHA256,
    "certification-implementation-readme"
  );
}

function loadCanonical(repoRoot, relative, maximumBytes = 4 * 1024 * 1024) {
  assertRelative(relative);
  const resolved = path.resolve(repoRoot, relative);
  expect(
    resolved.startsWith(`${repoRoot}${path.sep}`),
    `canonical-containment-${relative}`
  );
  return loadCanonicalJson(resolved, maximumBytes);
}

function loadCanonicalAbsolute(directory, name, maximumBytes) {
  expect(!name.includes("/") && !name.includes("\\"), "canonical-absolute-name");
  const file = path.join(directory, name);
  const resolved = path.resolve(file);
  expect(
    resolved.startsWith(`${path.resolve(directory)}${path.sep}`),
    "canonical-absolute-containment"
  );
  return loadCanonicalJson(resolved, maximumBytes);
}

function readBoundedRegularFile(
  repoRoot,
  relative,
  maximumBytes = 4 * 1024 * 1024
) {
  assertRelative(relative);
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, relative);
  expect(resolved.startsWith(`${root}${path.sep}`), `file-containment-${relative}`);
  const stat = fs.lstatSync(resolved);
  expect(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      stat.size > 0 &&
      stat.size <= maximumBytes &&
      fs.realpathSync(resolved) === resolved,
    `bounded-regular-file-${relative}`
  );
  return fs.readFileSync(resolved);
}

function gitBlob(repoRoot, commit, relative) {
  expect(COMMIT.test(commit), "git-blob-commit");
  assertRelative(relative);
  const bytes = execFileSync("git", ["cat-file", "blob", `${commit}:${relative}`], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024
  });
  expect(bytes.length > 0 && bytes.length <= 256 * 1024 * 1024, "git-blob-size");
  return bytes;
}

function gitText(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
}

function assertRelative(relative) {
  expect(
    typeof relative === "string" &&
      relative.length > 0 &&
      !path.isAbsolute(relative) &&
      !relative.split(/[\\/]/u).includes(".."),
    "relative-path"
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
    throw new Error(`maintainer-certification: ${label}`);
  }
}
