import { types as nodeTypes } from "node:util";
import { STATE_SCHEMA_VERSION } from "../../version.js";
import { readContainedText } from "./write-fs.js";

/**
 * @typedef {Record<string, unknown>} PersistedState
 * @typedef {{maxBytes?: number}} InspectionOptions
 * @typedef {{
 *   state: PersistedState | null,
 *   found: boolean,
 *   valid: boolean,
 *   warning: string | null
 * }} StateInspection
 * @typedef {{
 *   handoff: {
 *     found: boolean,
 *     valid: boolean,
 *     status: string,
 *     bytes: number
 *   },
 *   warning: string | null
 * }} HandoffInspection
 * @typedef {{valid: false, field: string, reason: string}} ValidationIssue
 * @typedef {{valid: true, field: null, reason: null} |
 *   ValidationIssue} StateValidation
 * @typedef {"string" |
 *   "boolean" |
 *   "nonnegative-integer" |
 *   "positive-integer" |
 *   "nullable-string" |
 *   "nullable-boolean" |
 *   "nullable-integer" |
 *   "nullable-nonnegative-integer" |
 *   "nullable-hash"} ScalarRule
 * @typedef {{kind: "array", item: FieldRule, nullable?: boolean}} ArrayRule
 * @typedef {{
 *   kind: "record",
 *   required: Record<string, FieldRule>,
 *   optional: Record<string, FieldRule>
 * }} RecordRule
 * @typedef {{
 *   kind: "enum",
 *   values: string[],
 *   diagnosticField: string | null
 * }} EnumRule
 * @typedef {ScalarRule | ArrayRule | RecordRule | EnumRule} FieldRule
 */

const DEFAULT_STATE_BYTES = 2 * 1024 * 1024;
const DEFAULT_HANDOFF_BYTES = 256 * 1024;
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const MAX_HANDOFF_BYTES = 2 * 1024 * 1024;

/** @type {Set<string>} */
const CURRENT_FIELDS = new Set([
  "version",
  "run_id",
  "generated_at",
  "repo",
  "scan",
  "git",
  "purpose",
  "commands",
  "important_files",
  "code_intelligence",
  "tests",
  "ci",
  "deployment",
  "release",
  "todos",
  "current_state",
  "verification",
  "configuration",
  "command_execution",
  "files",
  "evidence_count",
  "schema_version"
]);

/** @type {[string, "string" | "object" | "array" | "nullable-array" | "integer"][]} */
const REQUIRED_FIELDS = [
  ["version", "string"],
  ["run_id", "string"],
  ["generated_at", "string"],
  ["repo", "object"],
  ["scan", "object"],
  ["git", "object"],
  ["purpose", "object"],
  ["commands", "object"],
  ["important_files", "array"],
  ["code_intelligence", "object"],
  ["tests", "object"],
  ["ci", "object"],
  ["deployment", "object"],
  ["release", "object"],
  ["todos", "array"],
  ["current_state", "object"],
  ["verification", "object"],
  ["configuration", "object"],
  ["command_execution", "object"],
  ["files", "object"],
  ["evidence_count", "integer"]
];

const STRING = /** @type {ScalarRule} */ ("string");
const BOOLEAN = /** @type {ScalarRule} */ ("boolean");
const NONNEGATIVE_INTEGER =
  /** @type {ScalarRule} */ ("nonnegative-integer");
const POSITIVE_INTEGER = /** @type {ScalarRule} */ ("positive-integer");
const NULLABLE_STRING = /** @type {ScalarRule} */ ("nullable-string");
const NULLABLE_BOOLEAN = /** @type {ScalarRule} */ ("nullable-boolean");
const NULLABLE_INTEGER = /** @type {ScalarRule} */ ("nullable-integer");
const NULLABLE_NONNEGATIVE_INTEGER =
  /** @type {ScalarRule} */ ("nullable-nonnegative-integer");
const NULLABLE_HASH = /** @type {ScalarRule} */ ("nullable-hash");
const STRINGS = arrayRule(STRING);
const CONFIDENCE = enumRule(["known", "likely", "unknown"]);
const COMMAND_POLICY = enumRule(["ask", "never"], "value");

const PATH_FAILURE = recordRule({
  path: NULLABLE_STRING,
  status: STRING,
  code: STRING,
  reason: STRING
});
const SCAN_FIELDS = [
  "complete",
  "strategy",
  "max_files",
  "max_entries",
  "max_file_bytes",
  "max_total_hash_bytes",
  "max_total_text_bytes",
  "max_elapsed_ms",
  "entries_visited",
  "total_bytes_hashed",
  "total_text_bytes_read",
  "elapsed_ms",
  "unreadable_entries",
  "missing_tracked_files",
  "ignored_directories",
  "kanon_ignored_entries",
  "sensitive_files_skipped",
  "symlinks_skipped",
  "rejected_paths",
  "outside_root_paths",
  "path_failures",
  "path_failures_truncated",
  "budgets_reached",
  "git_observation_failed",
  "git_diagnostic"
];
/** @type {Record<string, FieldRule>} */
const SCAN_RULES = Object.fromEntries(
  SCAN_FIELDS.map((field) => [field, NONNEGATIVE_INTEGER])
);
Object.assign(SCAN_RULES, {
  complete: BOOLEAN,
  strategy: STRING,
  truncated: BOOLEAN,
  path_failures: arrayRule(PATH_FAILURE),
  path_failures_truncated: BOOLEAN,
  budgets_reached: STRINGS,
  git_observation_failed: BOOLEAN,
  git_diagnostic: NULLABLE_STRING
});

const COMMAND = recordRule({
  command: STRING,
  cwd: STRING,
  source: STRING,
  confidence: CONFIDENCE,
  evidence: STRINGS
}, {
  detail: NULLABLE_STRING,
  trust: STRING
});
const COMMANDS = arrayRule(COMMAND);
const SIGNAL = recordRule({
  found: BOOLEAN,
  files: arrayRule(recordRule({
    path: STRING,
    evidence: STRING
  }))
});
const CLAIM = recordRule({ claim: STRING }, {
  reason: STRING,
  evidence: STRINGS,
  trust: STRING,
  confidence: CONFIDENCE
});
const CLAIMS = arrayRule(CLAIM);
const OBSERVATION = recordRule({
  type: STRING,
  severity: STRING,
  conclusion: STRING,
  claim: STRING,
  observation: STRING,
  evidence: STRINGS
}, { suggestion: STRING });
const OBSERVATIONS = arrayRule(OBSERVATION);

/**
 * Fixed schema-2 rules. Top-level presence and broad types are checked first
 * so the public validation diagnostics remain compatible with v1.0.0.
 *
 * @type {Record<string, FieldRule>}
 */
const CURRENT_FIELD_RULES = {
  repo: recordRule({
    name: STRING,
    root: STRING,
    languages: STRINGS,
    files_scanned: NONNEGATIVE_INTEGER
  }),
  scan: recordRule(SCAN_RULES),
  git: recordRule({
    found: BOOLEAN,
    branch: NULLABLE_STRING,
    head: NULLABLE_STRING,
    dirty: NULLABLE_BOOLEAN,
    change_count: NULLABLE_NONNEGATIVE_INTEGER,
    change_count_exact: BOOLEAN,
    changes: arrayRule(recordRule({
      path: STRING,
      index: STRING,
      worktree: STRING,
      trust: STRING
    })),
    changes_truncated: BOOLEAN,
    sensitive_changes_skipped: NONNEGATIVE_INTEGER,
    recent_commits: arrayRule(recordRule({
      hash: STRING,
      date: STRING,
      subject: STRING,
      trust: STRING
    })),
    observation_complete: BOOLEAN,
    diagnostics: arrayRule(recordRule({
      operation: STRING,
      kind: STRING,
      message: STRING
    }, {
      status: NULLABLE_INTEGER,
      signal: NULLABLE_STRING,
      timeout: BOOLEAN,
      overflow: BOOLEAN,
      stderr: STRING
    })),
    trust: STRING,
    evidence: STRINGS
  }),
  purpose: recordRule({
    claim: STRING,
    confidence: CONFIDENCE,
    evidence: STRINGS
  }, { trust: STRING }),
  commands: recordRule({
    run: COMMANDS,
    test: COMMANDS,
    build: COMMANDS,
    dev: COMMANDS
  }),
  important_files: arrayRule(recordRule({
    path: STRING,
    reason: STRING,
    fan_in: NONNEGATIVE_INTEGER,
    evidence: STRINGS
  }, { trust: STRING })),
  code_intelligence: recordRule({
    files_with_inbound_imports: NONNEGATIVE_INTEGER,
    entrypoints: arrayRule(recordRule({
      path: STRING,
      confidence: CONFIDENCE,
      reason: STRING
    })),
    top_fan_in: arrayRule(recordRule({
      path: STRING,
      fan_in: NONNEGATIVE_INTEGER
    }))
  }),
  tests: recordRule({
    found: BOOLEAN,
    files: STRINGS,
    count: NONNEGATIVE_INTEGER,
    frameworks: STRINGS,
    evidence: STRINGS
  }),
  ci: SIGNAL,
  deployment: SIGNAL,
  release: SIGNAL,
  todos: arrayRule(recordRule({
    path: STRING,
    line: POSITIVE_INTEGER,
    text: STRING
  }, { trust: STRING })),
  current_state: recordRule({
    known: CLAIMS,
    likely: CLAIMS,
    unknown: CLAIMS,
    stale_suspicious: CLAIMS,
    suggested: CLAIMS
  }),
  verification: recordRule({
    target: STRING,
    checked: BOOLEAN,
    applicable: BOOLEAN,
    scan_complete: BOOLEAN,
    issues: OBSERVATIONS,
    unknowns: OBSERVATIONS
  }, {
    note: STRING,
    commands_checked: NONNEGATIVE_INTEGER
  }),
  configuration: recordRule({
    found: BOOLEAN,
    valid: BOOLEAN,
    warning: NULLABLE_STRING,
    invalid_field: NULLABLE_STRING,
    command_execution: COMMAND_POLICY,
    evidence: STRINGS
  }),
  command_execution: recordRule({
    policy: COMMAND_POLICY,
    approval_required: BOOLEAN,
    execution_allowed: BOOLEAN,
    trust: STRING
  }),
  files: recordRule({
    fingerprints: arrayRule(recordRule({
      path: STRING,
      size: NONNEGATIVE_INTEGER,
      sha256: NULLABLE_HASH
    }))
  })
};

/**
 * Read and normalize a bounded versionless/schema-1 or schema-2 checkpoint.
 *
 * @param {string} root
 * @param {unknown} [options]
 * @returns {StateInspection}
 */
export function inspectPreviousState(root, options = {}) {
  const maximumBytes = inspectionLimit(
    options,
    DEFAULT_STATE_BYTES,
    MAX_STATE_BYTES
  );
  if (maximumBytes === null) {
    return invalidState(
      "STATE.json was not inspected because its read limit was invalid."
    );
  }
  const read = readContainedText(
    root,
    ".kanon/STATE.json",
    maximumBytes,
    { optional: true }
  );
  if (!read.ok && read.status === "missing") {
    return { state: null, found: false, valid: true, warning: null };
  }
  if (!read.ok) {
    return invalidState(
      `STATE.json was ignored because it was ${read.status}: ${read.reason}`
    );
  }

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(read.text);
  } catch {
    return invalidState("STATE.json was ignored because it is not valid JSON.");
  }
  const validation = validatePersistedState(parsed);
  if (!validation.valid) {
    return invalidState(
      `STATE.json was ignored at ${validation.field}: ${validation.reason}`
    );
  }
  if (!plainObject(parsed)) {
    return invalidState("STATE.json was ignored because its root is invalid.");
  }
  return {
    state: {
      ...parsed,
      schema_version:
        typeof parsed.schema_version === "number"
          ? parsed.schema_version
          : 1
    },
    found: true,
    valid: true,
    warning: null
  };
}

/**
 * @param {string} root
 * @param {unknown} [options]
 * @returns {HandoffInspection}
 */
export function inspectPreviousHandoff(root, options = {}) {
  const maximumBytes = inspectionLimit(
    options,
    DEFAULT_HANDOFF_BYTES,
    MAX_HANDOFF_BYTES
  );
  if (maximumBytes === null) {
    return {
      handoff: {
        found: true,
        valid: false,
        status: "invalid-options",
        bytes: 0
      },
      warning:
        "HANDOFF.md was not inspected because its read limit was invalid."
    };
  }
  const read = readContainedText(
    root,
    ".kanon/HANDOFF.md",
    maximumBytes,
    { optional: true }
  );
  if (!read.ok && read.status === "missing") {
    return {
      handoff: { found: false, valid: true, status: "missing", bytes: 0 },
      warning: null
    };
  }
  if (!read.ok) {
    return {
      handoff: {
        found: true,
        valid: false,
        status: read.status,
        bytes: 0
      },
      warning:
        `HANDOFF.md was ignored because it was ${read.status}: ${read.reason}`
    };
  }
  if (!read.text.startsWith("# Resume This Repo\n")) {
    return {
      handoff: {
        found: true,
        valid: false,
        status: "malformed",
        bytes: read.bytes
      },
      warning:
        "HANDOFF.md was ignored because its Kanon header was unavailable."
    };
  }
  return {
    handoff: {
      found: true,
      valid: true,
      status: "available",
      bytes: read.bytes
    },
    warning: null
  };
}

/**
 * Validate the permissive historical adapter or the exact current schema.
 *
 * @param {unknown} value
 * @returns {StateValidation}
 */
export function validatePersistedState(value) {
  if (!plainObject(value)) {
    return invalid("root", "Expected an object.");
  }
  const version = value.schema_version ?? 1;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > STATE_SCHEMA_VERSION
  ) {
    return invalid(
      "schema_version",
      `Expected a supported version from 1 to ${STATE_SCHEMA_VERSION}.`
    );
  }
  if (version === 1) {
    return plainObject(value.repo)
      ? valid()
      : invalid("repo", "Legacy state requires a repo object.");
  }
  for (const key of Object.keys(value)) {
    if (!CURRENT_FIELDS.has(key)) {
      return invalid(key, `Unknown current-schema field: ${key}.`);
    }
  }
  for (const [field, type] of REQUIRED_FIELDS) {
    if (!hasType(value[field], type)) {
      return invalid(field, `Expected ${type}.`);
    }
  }
  if (
    typeof value.generated_at !== "string" ||
    !Number.isFinite(Date.parse(value.generated_at))
  ) {
    return invalid("generated_at", "Expected an ISO timestamp.");
  }
  for (const [field, rule] of Object.entries(CURRENT_FIELD_RULES)) {
    const issue = validateField(value[field], field, rule);
    if (issue) {
      return issue;
    }
  }
  return valid();
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {FieldRule} rule
 * @returns {ValidationIssue | null}
 */
function validateField(value, field, rule) {
  if (typeof rule === "string") {
    return validateScalar(value, field, rule);
  }
  if (rule.kind === "enum") {
    return typeof value === "string" && rule.values.includes(value)
      ? null
      : invalid(
          rule.diagnosticField || field,
          `Expected one of: ${rule.values.join(", ")}.`
        );
  }
  if (rule.kind === "array") {
    if (rule.nullable && value === null) {
      return null;
    }
    if (!Array.isArray(value)) {
      return invalid(field, "Expected an array.");
    }
    for (let index = 0; index < value.length; index += 1) {
      const issue = validateField(
        value[index],
        `${field}[${index}]`,
        rule.item
      );
      if (issue) {
        return issue;
      }
    }
    return null;
  }
  if (!plainObject(value)) {
    return invalid(field, "Expected an object.");
  }
  const allowed = new Set([
    ...Object.keys(rule.required),
    ...Object.keys(rule.optional)
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      return invalid(`${field}.${key}`, "Unknown field.");
    }
  }
  for (const [key, childRule] of Object.entries(rule.required)) {
    if (!Object.hasOwn(value, key)) {
      return invalid(`${field}.${key}`, "Missing required field.");
    }
    const issue = validateField(value[key], `${field}.${key}`, childRule);
    if (issue) {
      return issue;
    }
  }
  for (const [key, childRule] of Object.entries(rule.optional)) {
    if (Object.hasOwn(value, key)) {
      const issue = validateField(value[key], `${field}.${key}`, childRule);
      if (issue) {
        return issue;
      }
    }
  }
  return null;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {ScalarRule} rule
 * @returns {ValidationIssue | null}
 */
function validateScalar(value, field, rule) {
  if (rule === "string") {
    return typeof value === "string"
      ? null
      : invalid(field, "Expected a string.");
  }
  if (rule === "boolean") {
    return typeof value === "boolean"
      ? null
      : invalid(field, "Expected a boolean.");
  }
  if (rule === "nonnegative-integer") {
    return typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0
      ? null
      : invalid(field, "Expected a nonnegative integer.");
  }
  if (rule === "positive-integer") {
    return typeof value === "number" &&
        Number.isInteger(value) &&
        value > 0
      ? null
      : invalid(field, "Expected a positive integer.");
  }
  if (rule === "nullable-string") {
    return value === null || typeof value === "string"
      ? null
      : invalid(field, "Expected a string.");
  }
  if (rule === "nullable-boolean") {
    return value === null || typeof value === "boolean"
      ? null
      : invalid(field, "Expected a boolean.");
  }
  if (rule === "nullable-integer") {
    return value === null ||
        (typeof value === "number" && Number.isInteger(value))
      ? null
      : invalid(field, "Expected an integer or null.");
  }
  if (rule === "nullable-nonnegative-integer") {
    return value === null ||
        (
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 0
        )
      ? null
      : invalid(field, "Expected a nonnegative integer.");
  }
  return value === null ||
      (typeof value === "string" && /^[0-9a-f]{64}$/.test(value))
    ? null
    : invalid(field, "Expected a lowercase SHA-256 or null.");
}

/**
 * @param {unknown} value
 * @param {"string" | "object" | "array" | "nullable-array" | "integer"} type
 * @returns {boolean}
 */
function hasType(value, type) {
  if (type === "nullable-array") {
    return value === null || Array.isArray(value);
  }
  if (type === "array") {
    return Array.isArray(value);
  }
  if (type === "object") {
    return plainObject(value);
  }
  if (type === "integer") {
    return typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0;
  }
  return typeof value === type;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function plainObject(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => !descriptor.get && !descriptor.set
  );
}

/**
 * @param {unknown} options
 * @param {number} fallback
 * @param {number} maximum
 * @returns {number | null}
 */
function inspectionLimit(options, fallback, maximum) {
  if (!plainObject(options)) {
    return null;
  }
  if (Object.keys(options).some((key) => key !== "maxBytes")) {
    return null;
  }
  if (options.maxBytes === undefined) {
    return fallback;
  }
  return typeof options.maxBytes === "number" &&
      Number.isSafeInteger(options.maxBytes) &&
      options.maxBytes > 0 &&
      options.maxBytes <= maximum
    ? options.maxBytes
    : null;
}

/** @param {FieldRule} item @param {boolean} [nullable] @returns {ArrayRule} */
function arrayRule(item, nullable = false) {
  return { kind: "array", item, nullable };
}

/**
 * @param {Record<string, FieldRule>} required
 * @param {Record<string, FieldRule>} [optional]
 * @returns {RecordRule}
 */
function recordRule(required, optional = {}) {
  return { kind: "record", required, optional };
}

/**
 * @param {string[]} values
 * @param {string | null} [diagnosticField]
 * @returns {EnumRule}
 */
function enumRule(values, diagnosticField = null) {
  return { kind: "enum", values, diagnosticField };
}

/** @param {string} warning @returns {StateInspection} */
function invalidState(warning) {
  return { state: null, found: true, valid: false, warning };
}

/**
 * @param {string} field
 * @param {string} reason
 * @returns {ValidationIssue}
 */
function invalid(field, reason) {
  return { valid: false, field, reason };
}

/** @returns {StateValidation} */
function valid() {
  return { valid: true, field: null, reason: null };
}
