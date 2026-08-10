import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  TRANSITION_SHA256,
  validateCandidateDiffScope,
  validateCandidateTransitionAuthority,
  validateCandidateTransitionValue,
  validateCertifiedCandidateInputs
} from "../eval/v1.0.0-candidate/lib/validator.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("candidate transition authority has one exact immutable commitment", () => {
  const validated = validateCandidateTransitionAuthority(repoRoot);
  assert.equal(validated.sha256, TRANSITION_SHA256);
  assert.equal(validated.transition.starting_bindings.ahead, 0);
  assert.equal(validated.transition.starting_bindings.behind, 0);
  assert.equal(
    validated.transition.interruption.status,
    "acknowledged-pre-freeze-draft-failure"
  );
  assert.equal(validated.transition.expected_effects.new_version, "1.0.0");
});

test("candidate transition revalidates certified inputs without disclosure", () => {
  const validated = validateCertifiedCandidateInputs(repoRoot);
  assert.deepEqual(validated, {
    approval: "authenticated-proceed",
    certified_input_count: 10,
    transition_sha256: TRANSITION_SHA256
  });
});

test("candidate transition permits only its frozen file scope", () => {
  const changed = validateCandidateDiffScope(
    repoRoot,
    "9ce62c66bab27acbc1695799e8ef15c54c0ea577"
  );
  assert.equal(Array.isArray(changed), true);
  assert.equal(
    changed.length === 0 ||
      changed.includes("eval/v1.0.0-candidate/TRANSITION.json"),
    true
  );
});

test("candidate transition rejects publication and assurance overclaims", () => {
  const original = validateCandidateTransitionAuthority(repoRoot).transition;
  for (const mutate of [
    (value) => {
      value.boundaries.publication_authorized = true;
    },
    (value) => {
      value.boundaries.evidence_strict_release_supported = true;
    },
    (value) => {
      value.boundaries.independence_established = true;
    },
    (value) => {
      value.boundaries.holdout_performance_established = true;
    },
    (value) => {
      value.boundaries.accepted_risks_remain_open = false;
    },
    (value) => {
      value.boundaries.prospective_protocol_active = true;
    },
    (value) => {
      value.forbidden_claims.pop();
    },
    (value) => {
      value.interruption.publication_authority_consumed = true;
    }
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(
      () => validateCandidateTransitionValue(changed),
      /v1\.0\.0-candidate-transition/u
    );
  }
});

test("candidate transition rejects starting, scope, version, and conclusion drift", () => {
  const original = validateCandidateTransitionAuthority(repoRoot).transition;
  for (const mutate of [
    (value) => {
      value.starting_bindings.head = "0".repeat(40);
    },
    (value) => {
      value.permitted_changes.release_hardening = [];
    },
    (value) => {
      value.expected_effects.new_version = "1.0.1";
    },
    (value) => {
      value.candidate_conclusions.success = "release-supported";
    },
    (value) => {
      value.next_permissible_action_after_success = "publish";
    }
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(
      () => validateCandidateTransitionValue(changed),
      /v1\.0\.0-candidate-transition/u
    );
  }
});
