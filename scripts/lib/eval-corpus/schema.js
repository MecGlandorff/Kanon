import fs from "node:fs";
import path from "node:path";

const REQUIRED_CATEGORIES = new Set([
  "python-ml",
  "go-service",
  "monorepo",
  "rust-cli",
  "django-app",
  "no-readme"
]);

export function loadCorpus(corpusPath) {
  const corpus = JSON.parse(fs.readFileSync(path.resolve(corpusPath), "utf8"));
  validateCorpus(corpus);
  return corpus;
}

export function validateCorpus(corpus) {
  if (!corpus || corpus.schema_version !== 1) {
    throw new Error("Corpus schema_version must be 1.");
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
  const categories = new Set();

  for (const item of corpus.cases) {
    if (!item || typeof item.id !== "string" || !item.id.includes("/")) {
      throw new Error("Every corpus case needs a stable owner/repository-style id.");
    }
    if (ids.has(item.id)) {
      throw new Error(`Duplicate corpus case id: ${item.id}`);
    }
    ids.add(item.id);
    categories.add(item.category);
    if (
      typeof item.repository !== "string" ||
      !/^https:\/\/github\.com\/.+\.git$/.test(item.repository)
    ) {
      throw new Error(`${item.id}: repository must be a public HTTPS GitHub clone URL.`);
    }
    if (
      typeof item.revision !== "string" ||
      !/^[0-9a-f]{40}$/.test(item.revision)
    ) {
      throw new Error(`${item.id}: revision must be a full 40-character Git commit.`);
    }
    validateLabels(item, corpus.policy);
  }
  for (const category of REQUIRED_CATEGORIES) {
    if (!categories.has(category)) {
      throw new Error(`Corpus is missing required category: ${category}`);
    }
  }
}

function validateLabels(item, policy) {
  if (!item.labels || !Array.isArray(item.labels.important_files)) {
    throw new Error(`${item.id}: labels.important_files is required.`);
  }
  if (item.labels.important_files.length !== policy.important_file_limit) {
    throw new Error(
      `${item.id}: expected exactly ${policy.important_file_limit} important files.`
    );
  }
  if (new Set(item.labels.important_files).size !== item.labels.important_files.length) {
    throw new Error(`${item.id}: important-file labels must be unique.`);
  }
  for (const relPath of item.labels.important_files) {
    validateRelativePath(item.id, relPath, "important file");
  }
  validateCommand(item.id, item.labels.run, "run");
  validateCommand(item.id, item.labels.test, "test");
  if (!Array.isArray(item.label_sources) || item.label_sources.length === 0) {
    throw new Error(`${item.id}: at least one label source is required.`);
  }
  for (const relPath of item.label_sources) {
    validateRelativePath(item.id, relPath, "label source");
  }
}

function validatePolicy(policy) {
  for (const key of [
    "false_positive_cost",
    "false_negative_cost",
    "important_file_limit",
    "minimum_precision",
    "minimum_recall",
    "maximum_weighted_error_per_case"
  ]) {
    if (!Number.isFinite(policy?.[key])) {
      throw new Error(`Corpus policy.${key} must be numeric.`);
    }
  }
  if (policy.false_positive_cost !== 5 * policy.false_negative_cost) {
    throw new Error(
      "Corpus policy must price a false positive at exactly 5x a false negative."
    );
  }
  for (const key of ["minimum_precision", "minimum_recall"]) {
    if (policy[key] < 0 || policy[key] > 1) {
      throw new Error(`Corpus policy.${key} must be between 0 and 1.`);
    }
  }
}

function validateRelativePath(id, relPath, label) {
  if (
    typeof relPath !== "string" ||
    !relPath ||
    path.posix.isAbsolute(relPath) ||
    relPath.split("/").includes("..") ||
    relPath.includes("\\")
  ) {
    throw new Error(`${id}: invalid ${label} path: ${String(relPath)}`);
  }
}

function validateCommand(id, value, kind) {
  if (value === null) {
    return;
  }
  if (
    !value ||
    typeof value.command !== "string" ||
    !value.command.trim() ||
    typeof value.cwd !== "string"
  ) {
    throw new Error(`${id}: ${kind} command must be null or { cwd, command }.`);
  }
  validateRelativePath(
    id,
    value.cwd === "." ? "placeholder" : value.cwd,
    `${kind} cwd`
  );
}
