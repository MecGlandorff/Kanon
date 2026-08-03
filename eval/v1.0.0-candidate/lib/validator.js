import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  loadCanonicalJson,
  validateWaiver
} from "../../v1.0.0-maintainer/lib/validator.js";
import { runGit } from "../../../src/git-runner.js";

export const CANDIDATE_ROOT = "eval/v1.0.0-candidate";
export const TRANSITION_RELATIVE = `${CANDIDATE_ROOT}/TRANSITION.json`;
export const TRANSITION_SHA256 =
  "cae7f7ddbb3c2058a0065a961b2b3b506261fecafdfd51dcef2efe79e4858880";

const STARTING_BINDINGS = Object.freeze({
  branch: "release/v.1.0.0",
  head: "134c6d268784e285a96cb445889c40573ff846d0",
  upstream: "origin/release/v.1.0.0",
  ahead: 0,
  behind: 0,
  initial_worktree: {
    tracked: "clean",
    untracked_drafts: [
      "eval/v1.0.0-candidate/TRANSITION.json",
      "eval/v1.0.0-candidate/lib/validator.js",
      "test/v1-release-candidate-transition.test.js"
    ]
  },
  package_version: "0.4.0-rc.1",
  runtime_dependency_count: 0,
  optional_dependency_count: 0,
  peer_dependency_count: 0,
  signed_waiver_sha256:
    "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6",
  maintainer_protocol_sha256:
    "635a08e4058407624fdb1779f1b4127a9e8d821dc50386dbae61fd39b2844092",
  risk_ledger_sha256:
    "838351cad051c13c0316f169ee30630d131292cf8061de0a25234376894167e7",
  documentation_transition_sha256:
    "629f4e3c7644f0756b2ce5c11f6d7fcb60a2c2f946249d6971c1a0fc042fa7c6",
  maintainer_certification_sha256:
    "017bca4aa2aff3d461a71acde5634b3fccb99b385a24e2500af31813f8f46415",
  certification_run_record_sha256:
    "4c2a67166eb35b75b2530ee154fd8d9aa40e452fdf71d717952dc71c2933a468",
  certification_evidence_tree_sha256:
    "49b1ee409f32eabaa6558f794c1199f3d3595635d1252ab6600ace375ecd9de8",
  production_artifact_sha256:
    "0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9",
  public_capabilities_sha256:
    "bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf",
  behaviorally_certified_source_commit:
    "7d35c81742ca7cbcd26207f3cf7b18fc09804041"
});

const CERTIFIED_FILES = Object.freeze({
  "eval/v1.0.0-maintainer/WAIVER.json":
    STARTING_BINDINGS.signed_waiver_sha256,
  "eval/v1.0.0-maintainer/PROTOCOL.json":
    STARTING_BINDINGS.maintainer_protocol_sha256,
  "eval/v1.0.0-maintainer/RISK_LEDGER.json":
    STARTING_BINDINGS.risk_ledger_sha256,
  "eval/v1.0.0-maintainer-certification/TRANSITION.json":
    STARTING_BINDINGS.documentation_transition_sha256,
  "eval/v1.0.0-maintainer-certification/evidence-sha256-49b1ee409f32eabaa6558f794c1199f3d3595635d1252ab6600ace375ecd9de8/certification.json":
    STARTING_BINDINGS.maintainer_certification_sha256,
  "eval/v1.0.0-maintainer-certification/evidence-sha256-49b1ee409f32eabaa6558f794c1199f3d3595635d1252ab6600ace375ecd9de8/run-record.json":
    STARTING_BINDINGS.certification_run_record_sha256
});

const SECTION_SHA256 = Object.freeze({
  permitted_changes:
    "5fed53c6cd32ad9883e2db03e13f3ee0b90b3caa87a803b40689adc2a9b68949",
  forbidden_changes:
    "83599f1ea5ddf02553c2347816c05dfa2fc586308fbd145e2bdb4144c2944d59",
  forbidden_claims:
    "30fed0a1a1844c3bd92f97301894e01c51a5f78d8079ddfaa60b651813c3be5d",
  validation_gates:
    "9c24d0f97a52907edf3819e2416063de56680bfbc9462c9bd9675b2aa41895a0",
  expected_effects:
    "8ae9f600e732db6d9f4dbc176098fee652e713418c936530c1bb295fdffab3f0",
  candidate_conclusions:
    "014bfd226abe408fd50b0e753e7bc32620c2aab5ee181481be1f0fb71f03aad5",
  boundaries:
    "a2133f9cb792ba1e8bb1315342ebe501a24982367eda4c876dae6256aef85818",
  hard_stops:
    "c8d345275665f30ed228e32e6d9bc10d7758d6bb54b12b30fa838f9e7be8f2ff",
  interruption:
    "70a9b5e8e168694db3b5e9a7480b6609499ad8f6e2510f3f84fb2a625986cf57"
});

const EVIDENCE_PATH = new RegExp(
  `^${CANDIDATE_ROOT}/evidence-sha256-[0-9a-f]{64}/` +
    "(?:candidate|complete-tree-commitment)\\.json$",
  "u"
);

export function validateCandidateTransitionAuthority(repoRoot) {
  const root = path.resolve(repoRoot);
  const transitionPath = path.join(root, TRANSITION_RELATIVE);
  const bytes = readRegularFile(transitionPath, 256 * 1024);
  const digest = sha256(bytes);
  expect(digest === TRANSITION_SHA256, "transition-hash");
  const transition = JSON.parse(bytes.toString("utf8"));
  validateCandidateTransitionValue(transition);
  return { sha256: digest, transition };
}

export function validateCandidateTransitionValue(transition) {
  expectExactKeys(transition, [
    "boundaries",
    "candidate_conclusions",
    "expected_effects",
    "forbidden_changes",
    "forbidden_claims",
    "hard_stops",
    "interruption",
    "next_permissible_action_after_success",
    "permitted_changes",
    "schema",
    "starting_bindings",
    "status",
    "validation_gates",
    "version"
  ], "transition");
  expect(
    transition.schema === "kanon-v1.0.0-candidate-transition-v1" &&
      transition.version === 1 &&
      transition.status === "frozen-before-candidate-transition",
    "transition-identity"
  );
  expect(
    isDeepStrictEqual(transition.starting_bindings, STARTING_BINDINGS),
    "starting-bindings"
  );
  expect(
    transition.boundaries.publication_authorized === false &&
      transition.boundaries.release_action_occurred === false &&
      transition.boundaries.evidence_strict_release_supported === false &&
      transition.boundaries.independence_established === false &&
      transition.boundaries.holdout_performance_established === false &&
      transition.boundaries.accepted_risks_remain_open === true &&
      transition.boundaries.prospective_protocol_active === false &&
      transition.boundaries.six_person_simulation_scope ===
        "simulated-development-only",
    "transition-boundaries"
  );
  expect(
    transition.candidate_conclusions.success ===
      "v1.0.0-candidate-prepared-awaiting-remote-validation" &&
      transition.candidate_conclusions.failure ===
        "v1.0.0-candidate-preparation-blocked" &&
      transition.candidate_conclusions.uncertain ===
        "v1.0.0-candidate-preparation-inconclusive",
    "candidate-conclusion-vocabulary"
  );
  expect(
    transition.expected_effects.old_version === "0.4.0-rc.1" &&
      transition.expected_effects.new_version === "1.0.0" &&
      transition.expected_effects.old_package_inventory_count === 128 &&
      transition.expected_effects.new_package_inventory_count === 129 &&
      transition.expected_effects.artifact_sha256_must_differ === true &&
      transition.expected_effects
        .behavior_must_be_equivalent_apart_from_version_metadata === true &&
      transition.expected_effects.public_capabilities_must_be_identical === true,
    "expected-effects"
  );
  expect(
    transition.next_permissible_action_after_success ===
      "separately-authorized-push-and-validate-only-remote-ci-for-the-frozen-v1.0.0-candidate",
    "next-permissible-action"
  );
  expect(
    transition.interruption.status ===
      "acknowledged-pre-freeze-draft-failure" &&
      transition.interruption.cause ===
        "human-maintainer-authorized-git-push-updated-upstream" &&
      transition.interruption.previous_draft_transition_sha256 ===
        "16a4eb0e851531cb0b9d73fa9c6ae724b6ffeb798f2f4abe93d5b46eaed1298b" &&
      transition.interruption.previous_relation_was_current === false &&
      transition.interruption.draft_was_committed === false &&
      transition.interruption.release_authority_consumed === false &&
      transition.interruption.corpus_authority_consumed === false &&
      transition.interruption.evaluation_authority_consumed === false &&
      transition.interruption.publication_authority_consumed === false &&
      transition.interruption.npm_content_published === false &&
      transition.interruption.tag_created === false &&
      transition.interruption.github_release_created === false &&
      transition.interruption.remote_ci_dispatched === false,
    "acknowledged-interruption"
  );
  for (const [key, digest] of Object.entries(SECTION_SHA256)) {
    expect(
      sha256(Buffer.from(JSON.stringify(transition[key]))) === digest,
      `exact-section-${key}`
    );
  }
  for (const key of [
    "authority",
    "candidate_evidence",
    "release_hardening",
    "version_transition"
  ]) {
    expect(
      Array.isArray(transition.permitted_changes[key]) &&
        transition.permitted_changes[key].length > 0,
      `permitted-${key}`
    );
  }
  for (const key of [
    "forbidden_changes",
    "forbidden_claims",
    "hard_stops",
    "validation_gates"
  ]) {
    expect(
      Array.isArray(transition[key]) &&
        transition[key].length > 0 &&
        new Set(transition[key]).size === transition[key].length,
      `${key}-inventory`
    );
  }
  return true;
}

export function validateCertifiedCandidateInputs(repoRoot) {
  const root = path.resolve(repoRoot);
  const transition = validateCandidateTransitionAuthority(root).transition;
  for (const [relative, expected] of Object.entries(CERTIFIED_FILES)) {
    expect(
      sha256(readRegularFile(path.join(root, relative), 4 * 1024 * 1024)) ===
        expected,
      `certified-input-${relative}`
    );
  }
  const evidenceRoot = path.join(
    root,
    "eval/v1.0.0-maintainer-certification",
    `evidence-sha256-${STARTING_BINDINGS.certification_evidence_tree_sha256}`
  );
  const tree = JSON.parse(
    readRegularFile(
      path.join(evidenceRoot, "complete-tree-commitment.json"),
      1024 * 1024
    ).toString("utf8")
  );
  expect(
    tree.semantic_sha256 ===
      STARTING_BINDINGS.certification_evidence_tree_sha256 &&
      isDeepStrictEqual(tree.files, [
        {
          path: "certification.json",
          sha256: STARTING_BINDINGS.maintainer_certification_sha256
        },
        {
          path: "run-record.json",
          sha256: STARTING_BINDINGS.certification_run_record_sha256
        }
      ]),
    "certification-evidence-tree"
  );
  const runRecord = JSON.parse(
    readRegularFile(path.join(evidenceRoot, "run-record.json"), 1024 * 1024)
      .toString("utf8")
  );
  expect(
    runRecord.artifact.production_sha256 ===
      STARTING_BINDINGS.production_artifact_sha256 &&
      runRecord.artifact.first_pack_sha256 ===
        STARTING_BINDINGS.production_artifact_sha256 &&
      runRecord.artifact.second_pack_sha256 ===
        STARTING_BINDINGS.production_artifact_sha256 &&
      runRecord.artifact.byte_identical === true,
    "certified-production-artifact"
  );
  const waiver = validateFrozenSignedWaiver(root);
  expect(
    waiver.approval === "authenticated-proceed" &&
      waiver.waiver_sha256 === transition.starting_bindings.signed_waiver_sha256,
    "signed-waiver-mechanical-validation"
  );
  expect(
    git(root, ["cat-file", "-t", STARTING_BINDINGS.head]).trim() === "commit" &&
      git(root, [
        "cat-file",
        "-t",
        STARTING_BINDINGS.behaviorally_certified_source_commit
      ]).trim() === "commit",
    "certified-commits-present"
  );
  const startPackage = JSON.parse(
    git(root, ["show", `${STARTING_BINDINGS.head}:package.json`])
  );
  expect(
    startPackage.version === STARTING_BINDINGS.package_version &&
      Object.keys(startPackage.dependencies || {}).length === 0 &&
      Object.keys(startPackage.optionalDependencies || {}).length === 0 &&
      Object.keys(startPackage.peerDependencies || {}).length === 0,
    "starting-package-state"
  );
  expect(
    sha256(Buffer.from(git(root, [
      "show",
      `${STARTING_BINDINGS.head}:src/v1/build-metadata.json`
    ]))) === STARTING_BINDINGS.public_capabilities_sha256,
    "starting-public-capabilities"
  );
  return {
    approval: waiver.approval,
    certified_input_count: Object.keys(CERTIFIED_FILES).length + 4,
    transition_sha256: TRANSITION_SHA256
  };
}

export function validateFrozenSignedWaiver(repoRoot) {
  const root = path.resolve(repoRoot);
  const protocol = loadCanonicalJson(
    path.join(root, "eval/v1.0.0-maintainer/PROTOCOL.json")
  );
  const ledger = loadCanonicalJson(
    path.join(root, "eval/v1.0.0-maintainer/RISK_LEDGER.json")
  );
  const waiver = loadCanonicalJson(
    path.join(root, "eval/v1.0.0-maintainer/WAIVER.json")
  );
  expect(
    protocol.sha256 === STARTING_BINDINGS.maintainer_protocol_sha256 &&
      ledger.sha256 === STARTING_BINDINGS.risk_ledger_sha256 &&
      waiver.sha256 === STARTING_BINDINGS.signed_waiver_sha256,
    "frozen-waiver-input-hashes"
  );
  const approval = validateWaiver(
    waiver.value,
    protocol.sha256,
    ledger.sha256,
    protocol.value,
    ledger.value
  );
  expect(approval === "authenticated-proceed", "frozen-waiver-approval");
  return { approval, waiver_sha256: waiver.sha256 };
}

export function validateCandidateDiffScope(repoRoot, candidate = "HEAD") {
  const root = path.resolve(repoRoot);
  const transition = validateCandidateTransitionAuthority(root).transition;
  const fixed = new Set(
    Object.values(transition.permitted_changes)
      .flat()
      .filter((relative) => !relative.includes("<semantic-sha256>"))
  );
  const changed = git(root, [
    "diff",
    "--name-only",
    `${STARTING_BINDINGS.head}..${candidate}`
  ]).trim().split("\n").filter(Boolean);
  const unexpected = changed.filter(
    (relative) => !fixed.has(relative) && !EVIDENCE_PATH.test(relative)
  );
  expect(unexpected.length === 0, `candidate-diff-scope-${unexpected.join(",")}`);
  return changed;
}

function readRegularFile(file, maximumBytes) {
  const stat = fs.lstatSync(file);
  expect(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximumBytes,
    `bounded-regular-file-${file}`
  );
  return fs.readFileSync(file);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function git(root, args) {
  const result = runGit(root, args, {
    maxOutputBytes: 8 * 1024 * 1024,
    timeoutMs: 10_000
  });
  expect(result.ok, `git-${args[0]}-${result.diagnostic}`);
  return result.stdout;
}

function expectExactKeys(value, keys, label) {
  expect(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort()),
    `${label}-keys`
  );
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(`v1.0.0-candidate-transition:${label}`);
  }
}
