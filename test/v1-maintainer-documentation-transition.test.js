import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  GATE_IDS
} from "../eval/v1.0.0-maintainer/lib/validator.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateStart = "134c6d268784e285a96cb445889c40573ff846d0";
const transitionPath = path.join(
  repoRoot,
  "eval/v1.0.0-maintainer-certification/TRANSITION.json"
);
const transitionBytes = fs.readFileSync(transitionPath);
const transition = JSON.parse(transitionBytes.toString("utf8"));

test("documentation transition authority is canonical and exact", () => {
  assert.equal(
    transitionBytes.equals(Buffer.from(`${canonicalJson(transition)}\n`)),
    true
  );
  assert.equal(
    transition.schema,
    "kanon-v1.0.0-maintainer-documentation-transition-v1"
  );
  assert.equal(transition.version, 1);
  assert.equal(transition.status, "frozen-before-live-documentation-repair");
  assert.equal(
    transition.namespace,
    "eval/v1.0.0-maintainer-certification"
  );
  assert.deepEqual(transition.certification_gates, GATE_IDS);
});

test("transition binds the frozen standard, ledger, waiver, history, capability, and artifact", () => {
  const bindings = transition.bindings;
  for (const key of [
    "canonical_capabilities",
    "maintainer_protocol",
    "packaged_readme",
    "risk_ledger",
    "signed_waiver"
  ]) {
    const binding = bindings[key];
    assert.equal(
      sha256(gitBlob(candidateStart, binding.path)),
      binding.sha256
    );
  }
  assert.equal(
    bindings.maintainer_protocol.sha256,
    "635a08e4058407624fdb1779f1b4127a9e8d821dc50386dbae61fd39b2844092"
  );
  assert.equal(
    bindings.risk_ledger.sha256,
    "838351cad051c13c0316f169ee30630d131292cf8061de0a25234376894167e7"
  );
  assert.equal(
    bindings.signed_waiver.sha256,
    "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6"
  );
  assert.equal(
    bindings.production_artifact.sha256,
    "0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9"
  );
  assert.equal(
    bindings.canonical_capabilities.sha256,
    "bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf"
  );

  const historicalReadme = gitBlob(
    bindings.historical_readme.commit,
    bindings.historical_readme.path
  );
  assert.equal(sha256(historicalReadme), bindings.historical_readme.sha256);
  assert.equal(
    sha256(
      gitBlob(
        bindings.historical_freeze_record.commit,
        bindings.historical_freeze_record.path
      )
    ),
    bindings.historical_freeze_record.sha256
  );
  assert.equal(
    bindings.historical_freeze_record.result,
    "maintainer-certification-not-ready"
  );
});

test("the only permitted README repair is derived from canonical packaged skills", () => {
  const correction = transition.documentation_correction;
  const metadata = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, transition.bindings.canonical_capabilities.path),
      "utf8"
    )
  );
  const canonicalStable = metadata.public_capabilities.skills.filter(
    (skill) => skill !== "kanon"
  );
  assert.equal(canonicalStable.length, 6);
  assert.deepEqual(
    new Set(correction.stable_skill_order),
    new Set(canonicalStable)
  );
  assert.equal(correction.stable_skill_order.length, canonicalStable.length);

  const packagedReadme = fs.readFileSync(
    path.join(repoRoot, transition.bindings.packaged_readme.path),
    "utf8"
  );
  const stableDeclaration = packagedReadme.match(/stable ([\s\S]*?)\n  skills;/u);
  assert.ok(stableDeclaration);
  const packagedOrder = Array.from(
    stableDeclaration[1].matchAll(/`([^`]+)`/gu),
    (match) => match[1]
  );
  assert.deepEqual(packagedOrder, correction.stable_skill_order);

  for (const item of correction.stable_skill_descriptions) {
    const skill = fs.readFileSync(path.join(repoRoot, item.source), "utf8");
    const description = skill.match(/^description: "([^"]+)"$/mu);
    assert.ok(description);
    assert.equal(description[1], item.description);
  }

  const historical = gitBlob(
    transition.bindings.historical_readme.commit,
    transition.bindings.historical_readme.path
  ).toString("utf8");
  assert.equal(sha256(Buffer.from(historical)), correction.before_sha256);
  const corrected = applyAuthorizedCorrection(historical, correction);
  assert.equal(sha256(Buffer.from(corrected)), correction.after_sha256);
  assert.equal(correction.only_permitted_live_documentation_edit, true);
  assert.equal(correction.compatibility_workflows_must_remain_separate, true);
});

test("historical failure stays historical and all other evidence is immutable", () => {
  assert.deepEqual(transition.historical_interpretation, {
    historical_documentation_gate: "fail",
    historical_result: "maintainer-certification-not-ready",
    new_versioned_certification_must_evaluate_current_live_documentation: true,
    old_frozen_validator_live_path_binding_cannot_require_the_known_stale_readme_forever: true,
    old_readme_hash_proved_the_original_not_ready_state: true,
    previous_documentation_gate_must_not_be_relabelled_passing: true,
    repair_kind: "authorized-forward-documentation-repair"
  });
  assert.deepEqual(transition.preservation, {
    artifact_contents_change_allowed: false,
    claim_boundary_change_allowed: false,
    historical_evidence_change_allowed: false,
    maintainer_standard_and_freeze_remain_immutable: true,
    package_version_change_allowed: false,
    product_behavior_change_allowed: false,
    prospective_evidence_change_allowed: false,
    public_capability_change_allowed: false,
    risk_evidence_change_allowed: false,
    simulation_evidence_change_allowed: false,
    threshold_change_allowed: false,
    waiver_change_allowed: false
  });
});

function applyAuthorizedCorrection(readme, correction) {
  const start = readme.indexOf(correction.transformation.start_marker);
  const end = readme.indexOf(correction.transformation.end_marker, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const byName = new Map(
    correction.stable_skill_descriptions.map((item) => [item.name, item])
  );
  const rows = correction.stable_skill_order.map((name) => {
    const item = byName.get(name);
    assert.ok(item);
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

function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
}

function gitBlob(commit, relative) {
  return execFileSync("git", ["show", `${commit}:${relative}`], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 1024 * 1024
  });
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
