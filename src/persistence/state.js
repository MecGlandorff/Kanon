import { readContainedText } from "./safe-fs.js";
import { STATE_SCHEMA_VERSION } from "../version.js";
import { validateCurrentStateFields } from "./state-fields.js";

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
const DEFAULT_HANDOFF_BYTES = 256 * 1024;
const MAX_HANDOFF_BYTES = 2 * 1024 * 1024;

export function inspectPreviousState(root, options = {}) {
  const maximumBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const read = readContainedText(
    root,
    ".kanon/STATE.json",
    maximumBytes,
    { optional: true }
  );
  if (!read.ok && read.status === "missing") {
    return {
      state: null,
      found: false,
      valid: true,
      warning: null
    };
  }
  if (!read.ok) {
    return invalidState(
      `STATE.json was ignored because it was ${read.status}: ${read.reason}`
    );
  }

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
  return {
    state: {
      ...parsed,
      schema_version: parsed.schema_version ?? 1
    },
    found: true,
    valid: true,
    warning: null
  };
}

export function inspectPreviousHandoff(root, options = {}) {
  const maximumBytes =
    options &&
    typeof options === "object" &&
    !Array.isArray(options) &&
    (
      options.maxBytes === undefined ||
      (
        Number.isSafeInteger(options.maxBytes) &&
        options.maxBytes > 0 &&
        options.maxBytes <= MAX_HANDOFF_BYTES
      )
    )
      ? options.maxBytes ?? DEFAULT_HANDOFF_BYTES
      : null;
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
      handoff: {
        found: false,
        valid: true,
        status: "missing",
        bytes: 0
      },
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

export function validatePersistedState(value) {
  if (!plainObject(value)) {
    return invalid("root", "Expected an object.");
  }
  const version = value.schema_version ?? 1;
  if (
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
  for (const [field, type] of [
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
  ]) {
    if (!hasType(value[field], type)) {
      return invalid(field, `Expected ${type}.`);
    }
  }
  if (!Number.isFinite(Date.parse(value.generated_at))) {
    return invalid("generated_at", "Expected an ISO timestamp.");
  }
  return validateCurrentStateFields(value);
}

function hasType(value, type) {
  if (type === "array") {
    return Array.isArray(value);
  }
  if (type === "object") {
    return plainObject(value);
  }
  if (type === "integer") {
    return Number.isInteger(value) && value >= 0;
  }
  return typeof value === type;
}

function plainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function invalidState(warning) {
  return {
    state: null,
    found: true,
    valid: false,
    warning
  };
}

function invalid(field, reason) {
  return { valid: false, field, reason };
}

function valid() {
  return { valid: true, field: null, reason: null };
}
