import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  boundedDiagnostics,
  hasExactKeys,
  isPlainRecord,
  sanitizeDisplayText
} from "../core/trust.js";
import {
  isCompatibilitySensitiveRepositoryPath,
  isSafeRelativePath,
  isSensitiveRepositoryPath
} from "./read.js";

const GIT_TIMEOUT_MS = 2_000;
const GIT_OUTPUT_BYTES = 1024 * 1024;
const MAX_CHANGES = 64;
const MAX_COMMITS = 8;
const MAX_PATH_BYTES = 32 * 1024;
const MAX_PATH_ENTRIES = 128;

/**
 * @typedef {{
 *   ok: true,
 *   status: 0,
 *   stdout: string,
 *   stderr: string,
 *   timeout: false,
 *   overflow: false
 * } | {
 *   ok: false,
 *   status: number | null,
 *   stdout: string,
 *   stderr: string,
 *   timeout: boolean,
 *   overflow: boolean,
 *   diagnostic: string
 * }} GitRunResult
 * @typedef {(root: string, args: string[], options?: {
 *   timeout_ms?: number,
 *   max_output_bytes?: number
 * }) => unknown} GitRunner
 * @typedef {{
 *   found: boolean,
 *   branch: string | null,
 *   head: string | null,
 *   dirty: boolean | null,
 *   change_count: number | null,
 *   change_count_exact: boolean,
 *   changes: {
 *     path: string,
 *     index: string,
 *     worktree: string,
 *     trust: "repository-untrusted"
 *   }[],
 *   changes_truncated: boolean,
 *   sensitive_changes_skipped: number,
 *   recent_commits: {
 *     hash: string,
 *     date: string,
 *     subject: string,
 *     trust: "repository-untrusted"
 *   }[],
 *   observation_complete: boolean,
 *   diagnostics: string[],
 *   trust: "repository-untrusted"
 * }} GitObservation
 */

/**
 * @param {string} canonicalRoot
 * @param {{
 *   runner?: GitRunner,
 *   enabled?: boolean,
 *   timeout_ms?: number,
 *   max_output_bytes?: number,
 *   max_entries?: number,
 *   compatibility_sensitive_paths?: boolean
 * }} [options]
 * @returns {GitObservation}
 */
export function observeRepositoryGit(canonicalRoot, options = {}) {
  if (options.enabled === false) {
    return unavailableGit(["Git observation was disabled by caller."]);
  }
  const runner = typeof options.runner === "function"
    ? options.runner
    : runBoundedGit;
  const runOptions = gitRunOptions(options);
  /** @type {string[]} */
  const diagnostics = [];
  /**
   * @param {string[]} args
   * @returns {GitRunResult}
   */
  const observe = (args) => {
    let raw;
    try {
      raw = runner(canonicalRoot, args, runOptions);
    } catch {
      raw = null;
    }
    const result = validateGitResult(raw, runOptions.max_output_bytes);
    if (!result.ok) {
      diagnostics.push(result.diagnostic);
    }
    return result;
  };

  const inside = observe(["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return unavailableGit(
      diagnostics.length
        ? diagnostics
        : ["Git did not identify the selected root as a work tree."]
    );
  }

  const branchResult = observe(["branch", "--show-current"]);
  const headResult = observe(["rev-parse", "HEAD"]);
  const compatibilitySensitivePaths =
    options.compatibility_sensitive_paths === true;
  const maximumEntries = boundedInteger(options.max_entries, 10_000, 1, 100_000);
  const prefixResult = compatibilitySensitivePaths
    ? observe(["rev-parse", "--show-prefix"])
    : null;
  const repositoryPrefix = prefixResult === null
    ? ""
    : prefixResult.ok
      ? normalizeRepositoryPrefix(prefixResult.stdout)
      : null;
  if (prefixResult?.ok && repositoryPrefix === null) {
    diagnostics.push("Git repository prefix output was unavailable or invalid.");
  }
  const statusResult = observe([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=normal",
    "--",
    "."
  ]);
  const logResult = observe([
    "log",
    `-${MAX_COMMITS}`,
    "--pretty=format:%H%x00%cs%x00%s%x00",
    "--",
    "."
  ]);
  const parsedStatus = statusResult.ok && repositoryPrefix !== null
    ? parseStatus(
        statusResult.stdout,
        compatibilitySensitivePaths,
        repositoryPrefix,
        maximumEntries
      )
    : null;
  const parsedLog = logResult.ok
    ? parseLog(logResult.stdout)
    : null;
  if (parsedStatus !== null && !parsedStatus.complete) {
    diagnostics.push(
      "Git status output contained unavailable or invalid entries."
    );
  }
  if (parsedLog !== null && !parsedLog.complete) {
    diagnostics.push(
      "Git log output contained unavailable or invalid entries."
    );
  }
  const branchRaw = branchResult.ok
    ? branchResult.stdout.trim()
    : "";
  const branchValid =
    branchResult.ok &&
    (
      branchRaw === "" ||
      validGitDisplayText(branchRaw, 512)
    );
  const branch = branchValid && branchRaw
    ? branchRaw
    : null;
  if (branchResult.ok && !branchValid) {
    diagnostics.push("Git branch output was unavailable or invalid.");
  }
  const head = headResult.ok && /^[0-9a-f]{40,64}$/.test(
    headResult.stdout.trim()
  )
    ? headResult.stdout.trim()
    : null;
  if (headResult.ok && head === null) {
    diagnostics.push("Git HEAD output was unavailable or invalid.");
  }
  return {
    found: true,
    branch,
    head,
    dirty:
      parsedStatus === null || !parsedStatus.complete
        ? null
        : parsedStatus.change_count > 0,
    change_count:
      parsedStatus !== null && parsedStatus.complete
        ? parsedStatus.change_count
        : null,
    change_count_exact:
      parsedStatus !== null && parsedStatus.complete,
    changes: parsedStatus?.changes ?? [],
    changes_truncated: parsedStatus?.truncated ?? false,
    sensitive_changes_skipped: parsedStatus?.sensitive_skipped ?? 0,
    recent_commits: parsedLog?.commits ?? [],
    observation_complete:
      diagnostics.length === 0 &&
      branchResult.ok &&
      head !== null &&
      (prefixResult === null || (prefixResult.ok && repositoryPrefix !== null)) &&
      statusResult.ok &&
      logResult.ok &&
      parsedStatus !== null &&
      parsedStatus.complete &&
      parsedLog !== null &&
      parsedLog.complete,
    diagnostics: boundedDiagnostics(diagnostics, 8, 512),
    trust: "repository-untrusted"
  };
}

/** @param {string} canonicalRoot @param {{runner?: GitRunner, timeout_ms?: number, max_output_bytes?: number, max_entries?: number}} [options] */
export function listGitVisibleFiles(canonicalRoot, options = {}) {
  const runner = typeof options.runner === "function"
    ? options.runner
    : runBoundedGit;
  const runOptions = gitRunOptions(options);
  let raw;
  try {
    raw = runner(
      canonicalRoot,
      ["ls-files", "-co", "--exclude-standard", "-z"],
      runOptions
    );
  } catch {
    raw = null;
  }
  const result = validateGitResult(raw, runOptions.max_output_bytes);
  if (!result.ok) {
    return unavailableFileList(result.diagnostic);
  }
  if (result.stdout && !result.stdout.endsWith("\0")) {
    return unavailableFileList();
  }
  const maximumEntries = boundedInteger(options.max_entries, 10_000, 1, 100_000);
  const files = [], seen = new Set(), cursor = { offset: 0 };
  let observed = 0;
  while (cursor.offset < result.stdout.length) {
    const value = readNulField(result.stdout, cursor);
    if (value === null) return unavailableFileList();
    if (!value) continue;
    observed += 1;
    if (observed > maximumEntries) break;
    const selected = value.replaceAll("\\", "/");
    if (!isSafeRelativePath(selected)) {
      return unavailableFileList();
    }
    if (!seen.has(selected)) { seen.add(selected); files.push(selected); }
  }
  return {
    ok: true,
    files: files.sort(),
    diagnostic: observed > maximumEntries ? "Git file-list output exceeded its entry limit." : null
  };
}

/** @param {string} [diagnostic] */
function unavailableFileList(
  diagnostic = "Git file-list output was unavailable or invalid."
) {
  return { ok: false, files: /** @type {string[]} */ ([]), diagnostic };
}

/**
 * @param {string} root
 * @param {string[]} args
 * @param {{timeout_ms?: number, max_output_bytes?: number}} [options]
 * @returns {GitRunResult}
 */
export function runBoundedGit(root, args, options = {}) {
  const runOptions = gitRunOptions(options);
  const gitBinary = resolveGitBinary(root);
  if (gitBinary === null) {
    return {
      ok: false,
      status: null,
      stdout: "",
      stderr: "",
      timeout: false,
      overflow: false,
      diagnostic: "A trusted Git executable was unavailable."
    };
  }
  const started = Date.now();
  const result = spawnSync(
    gitBinary,
    [
      "-c",
      "core.fsmonitor=false",
      "-c",
      `core.hooksPath=${getEmptyConfigPath()}`,
      "-c",
      "pager.branch=false",
      "-c",
      "pager.log=false",
      "-c",
      "pager.status=false",
      "-c",
      "extensions.partialClone=",
      "-C",
      root,
      ...args
    ],
    {
      cwd: root,
      encoding: "buffer",
      env: hardenedGitEnvironment(root),
      maxBuffer: runOptions.max_output_bytes,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: runOptions.timeout_ms,
      windowsHide: true
    }
  );
  const stdoutBytes = Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout || "");
  const stderrBytes = Buffer.isBuffer(result.stderr)
    ? result.stderr
    : Buffer.from(result.stderr || "");
  const overflow =
    errorCode(result.error) === "ENOBUFS" ||
    stdoutBytes.length + stderrBytes.length > runOptions.max_output_bytes;
  const timeout =
    errorCode(result.error) === "ETIMEDOUT" ||
    (
      result.signal !== null &&
      Date.now() - started >= runOptions.timeout_ms
    );
  const status = Number.isInteger(result.status) ? result.status : null;
  if (
    status === 0 &&
    !overflow &&
    !timeout &&
    result.error === undefined
  ) {
    return {
      ok: true,
      status: 0,
      stdout: stdoutBytes.toString("utf8"),
      stderr: stderrBytes.toString("utf8"),
      timeout: false,
      overflow: false
    };
  }
  return {
    ok: false,
    status,
    stdout: stdoutBytes.toString("utf8"),
    stderr: stderrBytes.toString("utf8"),
    timeout,
    overflow,
    diagnostic:
      timeout
        ? "Git observation timed out."
        : overflow
          ? "Git observation exceeded its output limit."
          : status === null
            ? "Git could not be started."
            : `Git exited with status ${status}.`
  };
}

/**
 * @param {string} root
 * @returns {NodeJS.ProcessEnv}
 */
function hardenedGitEnvironment(root) {
  const safePath = executableSearchDirectories(root).join(path.delimiter);
  /** @type {NodeJS.ProcessEnv} */
  const environment = {
    PATH: safePath,
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: getEmptyConfigPath(),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: getEmptyConfigPath(),
    GIT_EDITOR: "true",
    GIT_NO_LAZY_FETCH: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_SEQUENCE_EDITOR: "true",
    GIT_TERMINAL_PROMPT: "0",
    PAGER: "cat"
  };
  if (process.platform === "win32") {
    const systemRoot = safeSystemRoot(root);
    if (systemRoot !== null) {
      environment.SystemRoot = systemRoot;
    }
  }
  return environment;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorCode(error) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  )
    ? error.code
    : "";
}

/**
 * @param {string} root
 * @returns {string | null}
 */
function resolveGitBinary(root) {
  const rejected = canonicalPath(root);
  const names = process.platform === "win32"
    ? ["git.exe", "git.cmd", "git.bat", "git"]
    : ["git"];
  for (const directory of executableSearchDirectories(root)) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      try {
        const canonical = realpath(candidate);
        const stat = fs.statSync(canonical);
        if (
          !stat.isFile() ||
          isWithin(rejected, canonical) ||
          (
            process.platform !== "win32" &&
            !hasExecutableBit(stat.mode)
          )
        ) {
          continue;
        }
        return canonical;
      } catch {
        // Continue to the next fixed PATH candidate.
      }
    }
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {GitRunResult}
 */
function validateGitResult(value, maximumOutputBytes = GIT_OUTPUT_BYTES) {
  if (
    !isPlainRecord(value) ||
    typeof value.ok !== "boolean" ||
    typeof value.stdout !== "string" ||
    typeof value.stderr !== "string" ||
    typeof value.timeout !== "boolean" ||
    typeof value.overflow !== "boolean" ||
    Buffer.byteLength(value.stdout) + Buffer.byteLength(value.stderr) >
      maximumOutputBytes
  ) {
    return invalidGitResult();
  }
  if (
    value.ok === true &&
    hasExactKeys(value, [
      "ok",
      "overflow",
      "status",
      "stderr",
      "stdout",
      "timeout"
    ]) &&
    value.status === 0 &&
    value.timeout === false &&
    value.overflow === false
  ) {
    return {
      ok: true,
      status: 0,
      stdout: value.stdout,
      stderr: value.stderr,
      timeout: false,
      overflow: false
    };
  }
  if (
    value.ok === false &&
    hasExactKeys(value, [
      "diagnostic",
      "ok",
      "overflow",
      "status",
      "stderr",
      "stdout",
      "timeout"
    ]) &&
    (
      value.status === null ||
      (
        typeof value.status === "number" &&
        Number.isInteger(value.status)
      )
    )
  ) {
    return {
      ok: false,
      status: value.status,
      stdout: value.stdout,
      stderr: value.stderr,
      timeout: value.timeout,
      overflow: value.overflow,
      diagnostic: sanitizeDisplayText(
        value.diagnostic,
        512
      ) || "Git observation was unavailable."
    };
  }
  return invalidGitResult();
}

/**
 * @param {{timeout_ms?: number, max_output_bytes?: number}} options
 */
function gitRunOptions(options) {
  return {
    timeout_ms: boundedInteger(options.timeout_ms, GIT_TIMEOUT_MS, 100, 60_000),
    max_output_bytes: boundedInteger(
      options.max_output_bytes, GIT_OUTPUT_BYTES, 1_024, 32 * 1024 * 1024
    )
  };
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} minimum
 * @param {number} maximum
 */
function boundedInteger(value, fallback, minimum, maximum) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}

/** @param {string} output @param {{offset: number}} cursor */
function readNulField(output, cursor) {
  const end = output.indexOf("\0", cursor.offset);
  if (end < 0) { cursor.offset = output.length; return null; }
  const field = output.slice(cursor.offset, end);
  cursor.offset = end + 1;
  return field;
}

/** @param {string} output @param {boolean} [compatibilitySensitivePaths] @param {string} [repositoryPrefix] @param {number} [maximumEntries] */
function parseStatus(
  output,
  compatibilitySensitivePaths = false,
  repositoryPrefix = "",
  maximumEntries = 10_000
) {
  /** @type {GitObservation["changes"]} */
  const changes = [];
  const cursor = { offset: 0 };
  let changeCount = 0;
  let observed = 0;
  let sensitiveSkipped = 0;
  let complete = output.length === 0 || output.endsWith("\0");
  while (cursor.offset < output.length) {
    const entry = readNulField(output, cursor);
    if (entry === null) { complete = false; break; }
    if (!entry) continue;
    observed += 1;
    if (observed > maximumEntries) { complete = false; break; }
    if (entry.length < 4) {
      complete = false;
      continue;
    }
    const indexStatus = entry[0] || " ";
    const worktreeStatus = entry[1] || " ";
    const selectedPath = stripRepositoryPrefix(
      entry.slice(3).replaceAll("\\", "/"),
      repositoryPrefix
    );
    if (
      !/^[ MADRCU?!]$/.test(indexStatus) ||
      !/^[ MADRCU?!]$/.test(worktreeStatus) ||
      entry[2] !== " " ||
      selectedPath === null ||
      !isSafeRelativePath(selectedPath)
    ) {
      complete = false;
      continue;
    }
    if (indexStatus === "R" || indexStatus === "C") {
      const original = readNulField(output, cursor);
      const originalPath = original?.replaceAll("\\", "/") || "";
      if (!isSafeRelativePath(originalPath)) complete = false;
    }
    changeCount += 1;
    if (
      compatibilitySensitivePaths
        ? isCompatibilitySensitiveRepositoryPath(selectedPath)
        : isSensitiveRepositoryPath(selectedPath)
    ) {
      sensitiveSkipped += 1;
      continue;
    }
    if (changes.length < MAX_CHANGES) {
      changes.push({
        path: selectedPath,
        index: indexStatus,
        worktree: worktreeStatus,
        trust: "repository-untrusted"
      });
    }
  }
  return {
    change_count: changeCount,
    changes,
    truncated: observed > maximumEntries ||
      changeCount - sensitiveSkipped > changes.length,
    sensitive_skipped: sensitiveSkipped,
    complete
  };
}

/** @param {string} output @returns {string | null} */
function normalizeRepositoryPrefix(output) {
  const selected = output
    .replace(/\r?\n$/, "")
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  if (/[\0\r\n]/.test(selected)) return null;
  if (!selected) return "";
  return isSafeRelativePath(selected) ? `${selected}/` : null;
}

/** @param {string} selectedPath @param {string} repositoryPrefix @returns {string | null} */
function stripRepositoryPrefix(selectedPath, repositoryPrefix) {
  if (!repositoryPrefix) return selectedPath;
  return selectedPath.startsWith(repositoryPrefix)
    ? selectedPath.slice(repositoryPrefix.length)
    : null;
}

/**
 * @param {string} output
 * @returns {{
 *   commits: GitObservation["recent_commits"],
 *   complete: boolean
 * }}
 */
function parseLog(output) {
  const fields = output.split("\0");
  /** @type {GitObservation["recent_commits"]} */
  const commits = [];
  let complete =
    output.length === 0 ||
    (
      output.endsWith("\0") &&
      (fields.length - 1) % 3 === 0
    );
  for (
    let index = 0;
    index + 2 < fields.length && commits.length < MAX_COMMITS;
    index += 3
  ) {
    const hash = fields[index]?.trim() || "";
    const date = fields[index + 1]?.trim() || "";
    const rawSubject = fields[index + 2] || "";
    const subject = sanitizeDisplayText(rawSubject, 512);
    if (
      !/^[0-9a-f]{40,64}$/.test(hash) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
      !validGitDisplayText(rawSubject, 512) ||
      !subject
    ) {
      if (hash || date || subject) {
        complete = false;
      }
      continue;
    }
    commits.push({
      hash,
      date,
      subject,
      trust: "repository-untrusted"
    });
  }
  return { commits, complete };
}

/**
 * Git display values may be sanitized, but a truncated or structurally
 * hostile value cannot support an observation-complete claim.
 *
 * @param {unknown} value
 * @param {number} maximum
 * @returns {value is string}
 */
function validGitDisplayText(value, maximum) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= maximum &&
    !/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(
      value
    )
  );
}

/**
 * @param {string[]} diagnostics
 * @returns {GitObservation}
 */
function unavailableGit(diagnostics) {
  return {
    found: false,
    branch: null,
    head: null,
    dirty: null,
    change_count: null,
    change_count_exact: false,
    changes: [],
    changes_truncated: false,
    sensitive_changes_skipped: 0,
    recent_commits: [],
    observation_complete: false,
    diagnostics: boundedDiagnostics(diagnostics, 8, 512),
    trust: "repository-untrusted"
  };
}

/**
 * @returns {GitRunResult}
 */
function invalidGitResult() {
  return {
    ok: false,
    status: null,
    stdout: "",
    stderr: "",
    timeout: false,
    overflow: false,
    diagnostic: "Git observation output was unavailable or invalid."
  };
}

/**
 * @returns {string}
 */
function getEmptyConfigPath() {
  return process.platform === "win32" ? "NUL" : os.devNull;
}

/**
 * Canonicalize only bounded absolute PATH directories outside the inspected
 * repository. Oversized or overlong host search paths fail closed instead of
 * being partially trusted.
 *
 * @param {string} root
 * @returns {string[]}
 */
function executableSearchDirectories(root) {
  const raw = process.env.PATH;
  if (
    typeof raw !== "string" ||
    Buffer.byteLength(raw, "utf8") > MAX_PATH_BYTES
  ) {
    return [];
  }
  const entries = raw.split(path.delimiter);
  if (entries.length > MAX_PATH_ENTRIES) {
    return [];
  }
  const rejected = canonicalPath(root);
  /** @type {string[]} */
  const directories = [];
  for (const entry of entries) {
    if (
      !entry ||
      entry.length > 4_096 ||
      entry.includes("\0") ||
      !path.isAbsolute(entry)
    ) {
      continue;
    }
    try {
      const directory = realpath(entry);
      const stat = fs.statSync(directory);
      if (
        !stat.isDirectory() ||
        isWithin(rejected, directory) ||
        directories.includes(directory)
      ) {
        continue;
      }
      directories.push(directory);
    } catch {
      // Continue to the next bounded absolute PATH directory.
    }
  }
  return directories;
}

/**
 * @param {string} root
 * @returns {string | null}
 */
function safeSystemRoot(root) {
  const value = process.env.SystemRoot;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4_096 ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  ) {
    return null;
  }
  try {
    const selected = realpath(value);
    return fs.statSync(selected).isDirectory() &&
      !isWithin(canonicalPath(root), selected)
      ? selected
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {number} mode
 * @returns {boolean}
 */
function hasExecutableBit(mode) {
  return (mode & 0o111) !== 0;
}

/**
 * @param {string} value
 * @returns {string}
 */
function canonicalPath(value) {
  try {
    return realpath(value);
  } catch {
    return path.resolve(value);
  }
}

/**
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    )
  );
}

/**
 * @param {string} value
 * @returns {string}
 */
function realpath(value) {
  return fs.realpathSync.native
    ? fs.realpathSync.native(value)
    : fs.realpathSync(value);
}
