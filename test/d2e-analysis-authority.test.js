import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publicSkillFiles } from "../scripts/lib/artifact-files.js";
import { loadAnalysisAuthority, validateAuthorityDocument } from "../scripts/lib/d2e-analysis-authority.js";
import { buildMechanismAnalysis } from "../scripts/lib/d2e-evidence.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("D.2E-A authority is exact, development-only, additive, and unshipped", () => {
  const { authority } = loadAnalysisAuthority(repoRoot);
  assert.doesNotThrow(() => validateAuthorityDocument(authority));
  for (const mutate of [
    (value) => { value.strict_equivalence = "passed"; },
    (value) => { value.unknown.pop(); },
    (value) => { value.does_not_establish.pop(); },
    (value) => { value.acceptance_rules.minimum_support_cases = 2; },
    (value) => { value.correction_implemented = true; }
  ]) {
    const changed = structuredClone(authority);
    mutate(changed);
    assert.throws(() => validateAuthorityDocument(changed));
  }
  const shipped = new Set(publicSkillFiles(repoRoot));
  for (const relative of ["eval/d2e/ANALYSIS_AUTHORITY.json", "scripts/lib/d2e-analysis-authority.js"]) {
    assert.equal(shipped.has(relative), false, relative);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"))).version, "0.4.0-rc.1");
});

test("frozen mechanism analysis covers every candidate and retains exact gates", () => {
  const cases = [["case-1", "category-a"], ["case-2", "category-a"], ["case-3", "category-b"]];
  const traces = cases.map((_, index) => ({
    scan: { complete: true },
    candidates: [
      ["false-positive", true, true], ["true-positive", true, true],
      ["false-negative", false, true], ["ineligible-control", false, false]
    ].map(([kind, selected, eligible], offset) =>
      candidate(index, offset + 1, kind, selected, eligible))
  }));
  const corpus = {
    cases: cases.map(([id, category], index) => ({
      id,
      category,
      labels: {
        important_files: ["true-positive", "false-negative"].map(
          (kind) => ({ path: pathFor(index, kind) }))
      }
    }))
  };
  const comparative = {
    cases: cases.map(([id], index) => ({
      d2a_case_id: id,
      candidates: [{ path: pathFor(index, "false-positive"), review_status: "selected" }]
    }))
  };
  const hash = "a".repeat(64);
  const analysis = buildMechanismAnalysis({
    binding: {
      source_commit: "b".repeat(40),
      package_version: "0.4.0-rc.1",
      protocol_sha256: hash,
      trace_schema_sha256: hash,
      analysis_schema_sha256: hash,
      corpus_sha256: hash,
      d2a_report_sha256: hash,
      cache_identity_sha256: hash,
      artifact_sha256: hash,
      conformance_report_sha256: hash
    },
    manifest: { trace_set_sha256: hash },
    report: {},
    corpus,
    comparative,
    traces,
    equivalenceSha256: hash
  });
  assert.deepEqual(
    [analysis.coverage.candidate_count, analysis.coverage.eligible_candidate_count,
      analysis.coverage.ranking_ineligible_candidate_count,
      analysis.coverage.all_candidates_analyzed],
    [12, 9, 3, true]
  );
  assert.deepEqual(analysis.status_counts, {
    "selected-true-positive": 3,
    "selected-false-positive": 3,
    "unselected-false-negative": 3,
    "unselected-control": 3
  });
  assert.deepEqual(analysis.structurally_qualifying_mechanisms, ["selection:root-readme"]);
  assert.deepEqual(
    ["minimum_support_cases", "minimum_support_categories", "minimum_control_cases",
      "minimum_control_categories", "minimum_counterexamples"].map(
      (key) => analysis.analysis_rules[key]),
    [3, 2, 3, 2, 1]
  );
  assert.equal(analysis.analysis_rules.correction_not_implemented, true);
});

function candidate(index, ordinal, kind, selected, eligible) {
  return {
    candidate_id: `candidate-${String(index * 4 + ordinal).padStart(64, "0")}`,
    normalized_path: pathFor(index, kind),
    ranking: {
      eligible,
      contributions: [],
      score: eligible ? 1 : null,
      fan_in: 0,
      referenced_by: 0
    },
    curation: { deduplicated: false, visits: [] },
    final: {
      selected,
      result: selected ? "selected" : eligible ? "not-selected" : "ranking-ineligible",
      selection_heuristic: selected ? "root-readme" : null
    }
  };
}

function pathFor(index, kind) { return `case-${index + 1}/${kind}.txt`; }
