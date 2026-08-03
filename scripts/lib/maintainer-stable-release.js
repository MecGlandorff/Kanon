import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  validateCandidateTransitionAuthority,
  validateFrozenSignedWaiver
} from "../../eval/v1.0.0-candidate/lib/validator.js";

export const RELEASE_KINDS = Object.freeze([
  "prerelease",
  "stable",
  "maintainer-stable"
]);
export const MAINTAINER_STABLE_VERSION = "1.0.0";
export const SIGNED_WAIVER_SHA256 =
  "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6";
export const MAINTAINER_CERTIFICATION_SHA256 =
  "017bca4aa2aff3d461a71acde5634b3fccb99b385a24e2500af31813f8f46415";

const CERTIFICATION_RELATIVE =
  "eval/v1.0.0-maintainer-certification/" +
  "evidence-sha256-49b1ee409f32eabaa6558f794c1199f3d3595635d1252ab6600ace375ecd9de8/" +
  "certification.json";
const HASH = /^[0-9a-f]{64}$/u;

export function validateReleasePolicy(repoRoot, input) {
  const root = path.resolve(repoRoot);
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
    expect(HASH.test(expectedCorpusSha256), "stable-holdout-commitment");
    expect(
      signedWaiverSha256 === "" && maintainerCertificationSha256 === "",
      "stable-no-maintainer-waiver-claim"
    );
    return conclusion(
      releaseKind,
      publicationMode,
      "evidence-strict-stable",
      true,
      false
    );
  }

  expect(candidateVersion === MAINTAINER_STABLE_VERSION, "maintainer-version");
  expect(expectedCorpusSha256 === "", "maintainer-no-holdout-claim");
  expect(
    signedWaiverSha256 === SIGNED_WAIVER_SHA256,
    "maintainer-waiver-commitment"
  );
  expect(
    maintainerCertificationSha256 === MAINTAINER_CERTIFICATION_SHA256,
    "maintainer-certification-commitment"
  );
  const authority = validateCandidateTransitionAuthority(root);
  const waiver = validateFrozenSignedWaiver(root);
  expect(
    authority.transition.boundaries.publication_authorized === false &&
      authority.transition.boundaries.release_action_occurred === false &&
      authority.transition.boundaries.evidence_strict_release_supported ===
        false &&
      authority.transition.boundaries.independence_established === false &&
      authority.transition.boundaries.holdout_performance_established === false,
    "maintainer-transition-boundaries"
  );
  expect(
    waiver.approval === "authenticated-proceed" &&
      waiver.waiver_sha256 === SIGNED_WAIVER_SHA256,
    "maintainer-approval"
  );
  const certificationPath = path.join(root, CERTIFICATION_RELATIVE);
  const bytes = fs.readFileSync(certificationPath);
  expect(
    crypto.createHash("sha256").update(bytes).digest("hex") ===
      MAINTAINER_CERTIFICATION_SHA256,
    "maintainer-certification-file"
  );
  const certification = JSON.parse(bytes.toString("utf8"));
  expect(
    certification.result === "maintainer-certification-ready" &&
      certification.boundaries.publication_authorized === false &&
      certification.boundaries.release_action_occurred === false &&
      certification.boundaries.evidence_strict_release_supported === false &&
      certification.boundaries.independence_established === false &&
      certification.boundaries.holdout_performance_established === false,
    "maintainer-certification-boundaries"
  );
  return conclusion(
    releaseKind,
    publicationMode,
    "maintainer-stable",
    false,
    true
  );
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
