import path from "node:path";

export function validateLabels(item, policy) {
  if (!item.labels || !Array.isArray(item.labels.important_files)) {
    throw new Error(`${item.id}: labels.important_files is required.`);
  }
  rejectUnknown(
    item.labels,
    new Set(["important_files", "run", "test"]),
    `${item.id}: labels`
  );
  if (item.labels.important_files.length !== policy.important_file_limit) {
    throw new Error(
      `${item.id}: expected exactly ${policy.important_file_limit} important files.`
    );
  }
  const paths = new Set();
  for (const label of item.labels.important_files) {
    if (!plainObject(label)) {
      throw new Error(`${item.id}: important-file labels must be objects.`);
    }
    rejectUnknown(
      label,
      new Set(["path", "relevance", "rationale", "sources"]),
      `${item.id}: important file`
    );
    validateRelativePath(item.id, label.path, "important file");
    if (paths.has(label.path)) {
      throw new Error(`${item.id}: important-file labels must be unique.`);
    }
    paths.add(label.path);
    if (
      !Number.isInteger(label.relevance) ||
      label.relevance < 1 ||
      label.relevance > 3
    ) {
      throw new Error(
        `${item.id}: important-file relevance must be 1, 2, or 3.`
      );
    }
    validateProvenance(item.id, label, "important file");
  }
  validateCommandLabel(item.id, item.labels.run, "run");
  validateCommandLabel(item.id, item.labels.test, "test");
}

export function expectedCommandEntries(label) {
  return label?.accepted || [];
}

function validateCommandLabel(id, value, kind) {
  if (value === null) {
    return;
  }
  if (
    !plainObject(value) ||
    !Array.isArray(value.accepted) ||
    value.accepted.length === 0 ||
    value.accepted.length > 10
  ) {
    throw new Error(
      `${id}: ${kind} must be null or an object with 1-10 accepted commands.`
    );
  }
  rejectUnknown(
    value,
    new Set(["accepted", "rationale", "sources"]),
    `${id}: ${kind}`
  );
  const keys = new Set();
  for (const command of value.accepted) {
    if (
      !plainObject(command) ||
      typeof command.command !== "string" ||
      !command.command.trim() ||
      command.command.length > 500 ||
      typeof command.cwd !== "string"
    ) {
      throw new Error(
        `${id}: ${kind} accepted commands require bounded cwd and command strings.`
      );
    }
    rejectUnknown(
      command,
      new Set(["cwd", "command"]),
      `${id}: accepted ${kind} command`
    );
    validateRelativePath(
      id,
      command.cwd === "." ? "placeholder" : command.cwd,
      `${kind} cwd`
    );
    const key = `${command.cwd}\0${command.command.trim()}`;
    if (keys.has(key)) {
      throw new Error(`${id}: duplicate accepted ${kind} command.`);
    }
    keys.add(key);
  }
  validateProvenance(id, value, `${kind} command`);
}

function validateProvenance(id, value, label) {
  if (
    typeof value.rationale !== "string" ||
    value.rationale.trim().length < 10 ||
    value.rationale.length > 1_000
  ) {
    throw new Error(`${id}: ${label} rationale is required.`);
  }
  if (
    !Array.isArray(value.sources) ||
    value.sources.length === 0 ||
    value.sources.length > 20
  ) {
    throw new Error(`${id}: ${label} sources are required.`);
  }
  for (const source of value.sources) {
    validateRelativePath(id, source, `${label} source`);
  }
}

function validateRelativePath(id, relPath, label) {
  if (
    typeof relPath !== "string" ||
    !relPath ||
    relPath.length > 500 ||
    path.posix.isAbsolute(relPath) ||
    path.win32.isAbsolute(relPath) ||
    relPath.split("/").includes("..") ||
    relPath.includes("\\")
  ) {
    throw new Error(`${id}: invalid ${label} path: ${String(relPath)}`);
  }
}

function plainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function rejectUnknown(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} has unknown field: ${key}.`);
    }
  }
}
