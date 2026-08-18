import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  validateFrozenSignedWaiver
} from "../../eval/v1.0.0-candidate/lib/validator.js";
import {
  loadCanonicalJson,
  validateRiskLedger,
  WAIVER_RISK_IDS
} from "../../eval/v1.0.0-maintainer/lib/validator.js";
import { runGit } from "../../src/git-runner.js";

export const RELEASE_KINDS = Object.freeze([
  "prerelease",
  "stable"
]);
export const SIGNED_WAIVER_SHA256 =
  "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6";
export const MAINTAINER_CERTIFICATION_SHA256 =
  "017bca4aa2aff3d461a71acde5634b3fccb99b385a24e2500af31813f8f46415";
export const FROZEN_DEVELOPMENT_REPORT_SHA256 =
  "747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3";

const FROZEN_SOURCE_COMMIT =
  "7d35c81742ca7cbcd26207f3cf7b18fc09804041";
const FROZEN_PROTOCOL_SHA256 =
  "635a08e4058407624fdb1779f1b4127a9e8d821dc50386dbae61fd39b2844092";
const FROZEN_RISK_LEDGER_SHA256 =
  "838351cad051c13c0316f169ee30630d131292cf8061de0a25234376894167e7";
const FROZEN_DEVELOPMENT_REPORT_RELATIVE =
  "eval/results/development-0.4.0-rc.1-d2a-74208b9a.json";
const FROZEN_DEVELOPMENT_CANDIDATE_COMMIT =
  "74208b9a21652f2e99d41000881f66e73d7eceeb";
const FROZEN_DEVELOPMENT_CORPUS_SHA256 =
  "4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92";

const CERTIFICATION_RELATIVE =
  "eval/v1.0.0-maintainer-certification/" +
  "evidence-sha256-49b1ee409f32eabaa6558f794c1199f3d3595635d1252ab6600ace375ecd9de8/" +
  "certification.json";
export function validateReleasePolicy(repoRoot, input) {
  void repoRoot;
  const releaseKind = input.releaseKind || "";
  const candidateVersion = input.candidateVersion || "";
  const expectedCorpusSha256 = input.expectedCorpusSha256 || "";
  const signedWaiverSha256 = input.signedWaiverSha256 || "";
  const maintainerCertificationSha256 =
    input.maintainerCertificationSha256 || "";
  const publicationMode = input.publicationMode || "validate-only";
  const protectedEnvironment = input.protectedEnvironment || "";

  expect(RELEASE_KINDS.includes(releaseKind), "release-kind");
  expect(
    publicationMode === "validate-only" || publicationMode === "publish",
    "publication-mode"
  );
  if (publicationMode === "publish") {
    expect(protectedEnvironment === "npm-publish", "protected-environment");
  } else {
    expect(protectedEnvironment === "", "validate-only-no-environment-claim");
  }

  if (releaseKind === "prerelease") {
    expect(candidateVersion.includes("-"), "prerelease-version");
    expect(expectedCorpusSha256 === "", "prerelease-no-holdout-claim");
    expect(
      signedWaiverSha256 === "" && maintainerCertificationSha256 === "",
      "prerelease-no-maintainer-stable-claim"
    );
    return conclusion(
      releaseKind,
      publicationMode,
      "prerelease-development",
      false,
      false
    );
  }

  expect(!candidateVersion.includes("-"), "stable-semantic-version");
  if (releaseKind === "stable") {
    expect(expectedCorpusSha256 === "", "stable-no-holdout-claim");
    expect(
      signedWaiverSha256 === "" && maintainerCertificationSha256 === "",
      "stable-no-maintainer-waiver-claim"
    );
    return conclusion(
      releaseKind,
      publicationMode,
      "standard-stable",
      false,
      false
    );
  }

  throw new Error("kanon-release-policy:retired-release-kind");
}

export function validateMaintainerStableEvidence(repoRoot) {
  const root = path.resolve(repoRoot);
  const protocol = loadCanonicalJson(
    path.join(root, "eval/v1.0.0-maintainer/PROTOCOL.json")
  );
  const ledger = loadCanonicalJson(
    path.join(root, "eval/v1.0.0-maintainer/RISK_LEDGER.json")
  );
  expect(protocol.sha256 === FROZEN_PROTOCOL_SHA256, "frozen-protocol-hash");
  expect(ledger.sha256 === FROZEN_RISK_LEDGER_SHA256, "frozen-ledger-hash");
  validateRiskLedger(ledger.value, protocol.value);
  const waiver = validateFrozenSignedWaiver(root);
  expect(
    waiver.approval === "authenticated-proceed" &&
      waiver.waiver_sha256 === SIGNED_WAIVER_SHA256,
    "frozen-waiver"
  );

  checkedGit(root, ["cat-file", "-e", `${FROZEN_SOURCE_COMMIT}^{commit}`]);
  const frozenEvidence = new Map();
  for (const binding of protocol.value.evidence_bindings) {
    const bytes = readHistoricalBlob(root, FROZEN_SOURCE_COMMIT, binding.path);
    expect(sha256(bytes) === binding.sha256, `frozen-evidence-${binding.id}`);
    frozenEvidence.set(binding.id, bytes);
  }

  const developmentBytes = readHistoricalBlob(
    root,
    FROZEN_SOURCE_COMMIT,
    FROZEN_DEVELOPMENT_REPORT_RELATIVE
  );
  expect(
    sha256(developmentBytes) === FROZEN_DEVELOPMENT_REPORT_SHA256,
    "frozen-development-report-hash"
  );
  const development = JSON.parse(developmentBytes.toString("utf8"));
  validateFrozenDevelopmentReport(development);
  for (const id of [
    "d2e-analysis-result",
    "post-correction-authority",
    "post-correction-evaluation"
  ]) {
    const evidence = JSON.parse(frozenEvidence.get(id).toString("utf8"));
    const bound =
      evidence.bindings?.d2a_report_sha256 ||
      evidence.immutable_commitments?.d2a_report_sha256;
    expect(
      bound === FROZEN_DEVELOPMENT_REPORT_SHA256,
      `frozen-development-chain-${id}`
    );
  }

  const accepted = new Set(WAIVER_RISK_IDS);
  const acceptedRecords = ledger.value.records.filter((record) =>
    accepted.has(record.id)
  );
  expect(
    acceptedRecords.length === WAIVER_RISK_IDS.length &&
      acceptedRecords.every(
        (record) =>
          record.resolution_status === "open" && record.waived === false
      ),
    "accepted-risks-open"
  );

  const certificationBytes = readRegularFile(
    path.join(root, CERTIFICATION_RELATIVE),
    4 * 1024 * 1024
  );
  expect(
    sha256(certificationBytes) === MAINTAINER_CERTIFICATION_SHA256,
    "frozen-maintainer-certification"
  );
  const certification = JSON.parse(certificationBytes.toString("utf8"));
  expect(
    certification.result === "maintainer-certification-ready" &&
      certification.risk_state.accepted_is_not_resolved === true &&
      isDeepStrictEqual(
        certification.risk_state.accepted_open,
        WAIVER_RISK_IDS
      ),
    "frozen-maintainer-risk-state"
  );

  return {
    schema: "kanon-maintainer-stable-frozen-evidence-binding-v1",
    source_commit: FROZEN_SOURCE_COMMIT,
    protocol_sha256: FROZEN_PROTOCOL_SHA256,
    risk_ledger_sha256: FROZEN_RISK_LEDGER_SHA256,
    signed_waiver_sha256: SIGNED_WAIVER_SHA256,
    maintainer_certification_sha256: MAINTAINER_CERTIFICATION_SHA256,
    frozen_evidence_binding_count: protocol.value.evidence_bindings.length,
    frozen_development: {
      path: FROZEN_DEVELOPMENT_REPORT_RELATIVE,
      sha256: FROZEN_DEVELOPMENT_REPORT_SHA256,
      candidate_commit: FROZEN_DEVELOPMENT_CANDIDATE_COMMIT,
      candidate_version: "0.4.0-rc.1",
      corpus_sha256: FROZEN_DEVELOPMENT_CORPUS_SHA256,
      case_count: 30,
      analysis_error_count: 0,
      incomplete_scan_count: 9,
      thresholds_passed: false,
      threshold_failures: [...development.summary.failures]
    },
    accepted_risk_count: WAIVER_RISK_IDS.length,
    accepted_risks_remain_open: true,
    failed_thresholds_called_passing: false,
    corpus_execution_occurred: false,
    holdout_execution_occurred: false,
    evidence_strict_release_supported: false,
    independence_established: false,
    holdout_performance_established: false,
    publication_authorized: false,
    release_action_occurred: false
  };
}

export function validateMaintainerStableEvidenceBinding(repoRoot, value) {
  const expected = validateMaintainerStableEvidence(repoRoot);
  expect(isDeepStrictEqual(value, expected), "frozen-evidence-binding-value");
  return expected;
}

function validateFrozenDevelopmentReport(report) {
  expect(
    report.candidate?.commit === FROZEN_DEVELOPMENT_CANDIDATE_COMMIT &&
      report.candidate?.version === "0.4.0-rc.1" &&
      report.analyzer?.version === "0.4.0-rc.1" &&
      report.analyzer?.source === "installed-artifact",
    "frozen-development-candidate"
  );
  expect(
    report.corpus?.schema_version === 2 &&
      report.corpus?.evaluation_role === "development" &&
      report.corpus?.manifest_sha256 === FROZEN_DEVELOPMENT_CORPUS_SHA256 &&
      report.corpus?.selected_case_count === 30 &&
      report.corpus?.total_case_count === 30,
    "frozen-development-corpus"
  );
  expect(
    report.summary?.case_count === 30 &&
      report.summary?.expected_case_count === 30 &&
      report.summary?.analysis_error_count === 0 &&
      report.summary?.incomplete_scan_count === 9 &&
      report.summary?.passed === false &&
      report.summary?.failures?.length === 7 &&
      report.final?.passed === false &&
      isDeepStrictEqual(report.final?.reasons, report.summary.failures) &&
      report.results?.length === 30 &&
      report.results.every((result) => !result.analysis_error) &&
      report.results.filter((result) => result.scan_complete === false)
        .length === 9,
    "frozen-development-result"
  );
}

function readHistoricalBlob(root, commit, relative) {
  expect(
    typeof relative === "string" &&
      relative.length > 0 &&
      relative.length <= 512 &&
      !path.isAbsolute(relative) &&
      !relative.includes("\\") &&
      !relative.split("/").includes(".."),
    "frozen-evidence-path"
  );
  const tree = checkedGit(root, [
    "ls-tree",
    "-z",
    "--full-tree",
    commit,
    "--",
    relative
  ]);
  const match = tree.match(
    /^(100644|100755) blob ([0-9a-f]{40})\t([^\0]+)\0$/u
  );
  expect(match && match[3] === relative, "frozen-evidence-tree-entry");
  const blob = checkedGit(root, ["cat-file", "blob", match[2]], "latin1");
  return Buffer.from(blob, "latin1");
}

function readRegularFile(file, maximumBytes) {
  const stat = fs.lstatSync(file);
  expect(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      stat.size > 0 &&
      stat.size <= maximumBytes,
    "frozen-regular-file"
  );
  return fs.readFileSync(file);
}

function checkedGit(root, args, encoding = "utf8") {
  const result = runGit(root, args, {
    encoding,
    maxOutputBytes: 32 * 1024 * 1024,
    noLazyFetch: true,
    timeoutMs: 10_000
  });
  expect(result.ok, `frozen-git-${args[0]}`);
  return result.stdout;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function releasePolicyFromEnvironment(environment = process.env) {
  return {
    expectedCorpusSha256: environment.KANON_EXPECTED_CORPUS_SHA256 || "",
    maintainerCertificationSha256:
      environment.KANON_MAINTAINER_CERTIFICATION_SHA256 || "",
    protectedEnvironment: environment.KANON_PROTECTED_ENVIRONMENT || "",
    publicationMode: environment.KANON_PUBLICATION_MODE || "validate-only",
    signedWaiverSha256: environment.KANON_SIGNED_WAIVER_SHA256 || ""
  };
}

function conclusion(
  releaseKind,
  publicationMode,
  assuranceLane,
  evidenceStrict,
  maintainerCertified
) {
  return {
    assurance_lane: assuranceLane,
    evidence_strict_release_supported: evidenceStrict,
    independence_established: evidenceStrict,
    holdout_performance_established: evidenceStrict,
    maintainer_certification_bound: maintainerCertified,
    publication_authorized: false,
    publication_mode: publicationMode,
    release_action_occurred: false,
    release_kind: releaseKind
  };
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(`kanon-release-policy:${label}`);
  }
}
