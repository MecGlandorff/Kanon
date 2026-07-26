import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateLabels } from "./schema-labels.js";

export const REQUIRED_CATEGORIES = Object.freeze([
  "python-ml",
  "go-service",
  "monorepo",
  "rust-cli",
  "python-web"
]);
export const DIMENSIONS = Object.freeze([
  "important_files",
  "run_command",
  "test_command"
]);
const EVALUATION_ROLES = new Set(["development", "release"]);
const TOP_LEVEL_FIELDS = new Set([
  "schema_version",
  "evaluation_role",
  "label_version",
  "policy",
  "cases",
  "release"
]);
const CASE_FIELDS = new Set([
  "id",
  "category",
  "repository",
  "revision",
  "labels",
  "strata"
]);
const POLICY_FIELDS = new Set([
  "false_positive_cost",
  "false_negative_cost",
  "important_file_limit",
  "minimum_precision",
  "minimum_recall",
  "maximum_weighted_error_per_case",
  "dimension_thresholds",
  "minimum_cases_per_category",
  "category_thresholds"
]);

export function loadCorpus(corpusPath) {
  const resolved = path.resolve(corpusPath);
  const bytes = fs.readFileSync(resolved);
  if (bytes.length > 4 * 1024 * 1024) {
    throw new Error("Corpus manifest exceeds its 4 MiB input limit.");
  }
  const corpus = JSON.parse(bytes.toString("utf8"));
  validateCorpus(corpus);
  Object.defineProperty(corpus, "_manifest", {
    enumerable: false,
    value: {
      path: resolved,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex")
    }
  });
  return corpus;
}

export function validateCorpus(corpus) {
  if (!corpus || corpus.schema_version !== 2) {
    throw new Error("Corpus schema_version must be 2.");
  }
  rejectUnknownFields(corpus, TOP_LEVEL_FIELDS, "corpus");
  if (
    typeof corpus.label_version !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(corpus.label_version)
  ) {
    throw new Error("Corpus label_version must be an ISO date.");
  }
  if (!EVALUATION_ROLES.has(corpus.evaluation_role)) {
    throw new Error(
      "Corpus evaluation_role must be development or release."
    );
  }
  if (corpus.evaluation_role === "release") {
    validateReleaseMetadata(corpus.release);
  }
  if (
    !Array.isArray(corpus.cases) ||
    corpus.cases.length < 30 ||
    corpus.cases.length > 50
  ) {
    throw new Error("Corpus must contain between 30 and 50 cases.");
  }
  validatePolicy(corpus.policy);
  const ids = new Set();
  const categoryCounts = Object.fromEntries(
    REQUIRED_CATEGORIES.map((category) => [category, 0])
  );

  for (const item of corpus.cases) {
    validateCase(item, ids, corpus.policy);
    if (!Object.hasOwn(categoryCounts, item.category)) {
      throw new Error(`${item.id}: unsupported category ${item.category}.`);
    }
    categoryCounts[item.category] += 1;
  }
  for (const category of REQUIRED_CATEGORIES) {
    if (
      categoryCounts[category] <
      corpus.policy.minimum_cases_per_category
    ) {
      throw new Error(
        `Corpus category ${category} has ${categoryCounts[category]} cases; ` +
        `${corpus.policy.minimum_cases_per_category} are required.`
      );
    }
  }
}

function validateCase(item, ids, policy) {
  rejectUnknownFields(item, CASE_FIELDS, item?.id || "case");
  if (!item || typeof item.id !== "string" || !item.id.includes("/")) {
    throw new Error(
      "Every corpus case needs a stable owner/repository-style id."
    );
  }
  if (ids.has(item.id)) {
    throw new Error(`Duplicate corpus case id: ${item.id}`);
  }
  ids.add(item.id);
  if (
    typeof item.repository !== "string" ||
    !/^https:\/\/github\.com\/.+\.git$/.test(item.repository)
  ) {
    throw new Error(
      `${item.id}: repository must be a public HTTPS GitHub clone URL.`
    );
  }
  if (!/^[0-9a-f]{40}$/.test(item.revision || "")) {
    throw new Error(
      `${item.id}: revision must be a full 40-character Git commit.`
    );
  }
  if (
    !Array.isArray(item.strata) ||
    item.strata.length > 10 ||
    item.strata.some((value) =>
      typeof value !== "string" || !value || value.length > 100
    ) ||
    new Set(item.strata).size !== item.strata.length
  ) {
    throw new Error(`${item.id}: strata must be unique bounded strings.`);
  }
  validateLabels(item, policy);
}

function validateReleaseMetadata(release) {
  if (!release || typeof release !== "object") {
    throw new Error("Release corpora require release metadata.");
  }
  rejectUnknownFields(
    release,
    new Set([
      "candidate_commit",
      "candidate_version",
      "frozen_at",
      "implementation_author",
      "labeler",
      "independent_reviewer"
    ]),
    "release"
  );
  if (!/^[0-9a-f]{40}$/.test(release.candidate_commit || "")) {
    throw new Error(
      "Release candidate_commit must be a full Git commit."
    );
  }
  if (
    typeof release.candidate_version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(
      release.candidate_version
    )
  ) {
    throw new Error("Release candidate_version must be semantic.");
  }
  if (
    typeof release.frozen_at !== "string" ||
    !Number.isFinite(Date.parse(release.frozen_at))
  ) {
    throw new Error("Release frozen_at must be an ISO timestamp.");
  }
  for (const field of [
    "implementation_author",
    "labeler",
    "independent_reviewer"
  ]) {
    if (
      typeof release[field] !== "string" ||
      release[field].trim().length === 0
    ) {
      throw new Error(`Release ${field} is required.`);
    }
  }
  if (
    new Set([
      release.implementation_author,
      release.labeler,
      release.independent_reviewer
    ]).size !== 3
  ) {
    throw new Error(
      "Release implementation author, labeler, and independent reviewer must be distinct."
    );
  }
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== "object") {
    throw new Error("Corpus policy must be a non-empty object.");
  }
  rejectUnknownFields(policy, POLICY_FIELDS, "policy");
  for (const key of [
    "false_positive_cost",
    "false_negative_cost",
    "important_file_limit",
    "maximum_weighted_error_per_case",
    "minimum_cases_per_category"
  ]) {
    if (!Number.isFinite(policy[key]) || policy[key] <= 0) {
      throw new Error(`Corpus policy.${key} must be positive.`);
    }
  }
  if (
    policy.false_positive_cost !==
    5 * policy.false_negative_cost
  ) {
    throw new Error(
      "Corpus policy must price a false positive at exactly 5x a false negative."
    );
  }
  validateThresholds(policy, "policy");
  rejectUnknownFields(
    policy.dimension_thresholds,
    new Set(DIMENSIONS),
    "policy.dimension_thresholds"
  );
  for (const dimension of DIMENSIONS) {
    validateThresholds(
      policy.dimension_thresholds?.[dimension],
      `dimension_thresholds.${dimension}`
    );
  }
  rejectUnknownFields(
    policy.category_thresholds,
    new Set(REQUIRED_CATEGORIES),
    "policy.category_thresholds"
  );
  for (const category of REQUIRED_CATEGORIES) {
    validateThresholds(
      policy.category_thresholds?.[category],
      `category_thresholds.${category}`
    );
  }
}

function rejectUnknownFields(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} has unknown field: ${key}.`);
    }
  }
}

function validateThresholds(value, field) {
  for (const key of ["minimum_precision", "minimum_recall"]) {
    if (
      !Number.isFinite(value?.[key]) ||
      value[key] <= 0 ||
      value[key] > 1
    ) {
      throw new Error(
        `Corpus ${field}.${key} must be greater than 0 and at most 1.`
      );
    }
  }
}
