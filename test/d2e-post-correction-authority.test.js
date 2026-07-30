import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authorityUrl = new URL(
  "../eval/d2e/POST_CORRECTION_AUTHORITY.json",
  import.meta.url,
);

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

test("post-correction authority is canonical and freezes the single attempt", () => {
  const raw = readFileSync(authorityUrl, "utf8");
  const authority = JSON.parse(raw);

  assert.equal(raw, `${JSON.stringify(sortKeys(authority))}\n`);
  assert.equal(authority.schema, "kanon-d2e-post-correction-authority-v1");
  assert.equal(authority.status, "frozen-before-corpus-or-evidence-access");
  assert.equal(authority.session.branch, "release/v.1.0.0");
  assert.equal(
    authority.session.authority_parent,
    "35d698193463c5c4432c485296a75a2b43cd7e64",
  );
  assert.equal(authority.session.authority_immutable_after_commit, true);
  assert.equal(authority.attempt.case_count, 30);
  assert.equal(authority.attempt.corpus_attempt_limit, 1);
  assert.equal(authority.attempt.runner_invocations, 1);
  assert.deepEqual(authority.attempt.control.execution_order, [
    "trace-on",
    "trace-off",
  ]);
  assert.equal(authority.inventory.attempt_success.exact_file_count, 35);
  assert.deepEqual(
    authority.inventory.attempt_success.exact_files.slice(5),
    Array.from(
      { length: 30 },
      (_, index) => `traces/${String(index + 1).padStart(3, "0")}.json`,
    ),
  );
  assert.deepEqual(authority.conclusions.allowed, [
    "correction-supported",
    "correction-not-supported",
    "inconclusive",
  ]);
  assert.equal(
    authority.decision_conditions.correction_supported.length,
    17,
  );
  assert.equal(authority.evidence_classification.classification, "development-only");
  assert.equal(
    authority.conclusions.strict_historical_equivalence,
    "failed-required-comparison-unavailable",
  );
  assert.equal(authority.resource_bounds.per_case_analysis_timeout_ms, 35000);
  assert.equal(authority.resource_bounds.analysis_child_old_space_mib, 512);
  assert.equal(authority.resource_bounds.trace_bytes_total, 1073741824);
  assert.equal(authority.session.package_version, "0.4.0-rc.1");
  assert.equal(authority.session.runtime_dependencies, 0);

  const hash = /^[0-9a-f]{64}$/;
  const commit = /^[0-9a-f]{40}$/;
  for (const [name, value] of Object.entries(authority.bindings)) {
    assert.match(value, name.endsWith("_commit") || name === "starting_head" ? commit : hash);
  }
});
