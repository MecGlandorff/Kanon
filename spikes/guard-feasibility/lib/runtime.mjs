import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

const HOST_STATE_PATHS = Object.freeze({
  "claude-code": ["CLAUDE_CONFIG_DIR"],
  "codex-cli": ["CODEX_HOME"]
});
const LOCALE_KEYS = Object.freeze(["LANG", "LC_ALL", "LC_CTYPE"]);
const SYSTEM_EXECUTABLE_DIRECTORIES = Object.freeze(
  process.platform === "win32"
    ? []
    : ["/usr/bin", "/bin", "/usr/sbin", "/sbin"]
);

export function parseExecutionOptions(argv, usage) {
  const options = { execute: false, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") {
      options.execute = true;
    } else if (argument === "--report") {
      options.report = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write(usage);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (!options.execute || !options.report) {
    throw new Error(usage.trim());
  }
  return options;
}

export function containedReportPath(repoRoot, value) {
  const root = canonicalPath(repoRoot);
  const output = canonicalPath(value);
  const relative = path.relative(root, output);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Spike report must be a file below the repository root.");
  }
  ensureRealDirectory(path.dirname(output));
  return output;
}

export function createScratch(prefix, options = {}) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  if (
    options.repoRoot &&
    isContained(canonicalPath(options.repoRoot), tempRoot)
  ) {
    throw new Error("Refusing a temporary root inside the repository.");
  }
  const created = fs.mkdtempSync(path.join(tempRoot, prefix));
  const root = fs.realpathSync(created);
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace, { mode: 0o700 });
  return {
    tempRoot,
    root,
    workspace,
    evidence: path.join(root, "evidence.jsonl")
  };
}

/**
 * Resolve a host executable from the caller's PATH without ever selecting a
 * repository-controlled file. The returned path is canonical and absolute so
 * later process creation does not repeat PATH lookup.
 */
export function resolveTrustedExecutable(
  command,
  { repoRoot, environment = process.env } = {}
) {
  if (!repoRoot) {
    throw new Error("Trusted executable resolution requires a repository root.");
  }
  const root = canonicalPath(repoRoot);
  const pathValue = boundedEnvironmentValue(environment.PATH, 64 * 1024);
  const candidates = executableNames(command, environment);
  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory || !path.isAbsolute(directory)) continue;
    for (const candidateName of candidates) {
      const lexical = path.resolve(directory, candidateName);
      if (isContained(root, lexical)) continue;
      let stat;
      let resolved;
      try {
        resolved = fs.realpathSync(lexical);
        stat = fs.statSync(resolved);
      } catch {
        continue;
      }
      if (
        isContained(root, resolved) ||
        !stat.isFile() ||
        (process.platform !== "win32" && (stat.mode & 0o111) === 0)
      ) {
        continue;
      }
      return resolved;
    }
  }
  throw new Error(
    `No trusted ${path.basename(command)} executable was found outside the repository.`
  );
}

/**
 * Build the complete child environment for a host probe.
 *
 * The allowlist is intentionally small:
 * - canonical PATH entries for the resolved host, this Node runtime, and
 *   fixed operating-system tools;
 * - HOME, Claude's bounded local USER identity, and the host's documented
 *   state-root override for authentication;
 * - bounded locale values; and
 * - a disposable TMPDIR/TMP/TEMP rooted in this probe's scratch directory.
 *
 * API keys, tokens, shell startup controls, NODE_OPTIONS, proxy settings, and
 * every other caller variable are omitted. Callers add only the two bounded
 * Kanon evidence paths after this function returns.
 */
export function createMinimalHostEnvironment({
  host,
  repoRoot,
  scratchRoot,
  hostExecutable,
  nodeExecutable = process.execPath,
  environment = process.env
}) {
  if (!Object.hasOwn(HOST_STATE_PATHS, host)) {
    throw new Error(`Unsupported host environment: ${host}`);
  }
  const root = canonicalPath(repoRoot);
  const scratch = canonicalExistingDirectory(scratchRoot, "scratch root");
  if (isContained(root, scratch)) {
    throw new Error("Probe scratch state must be outside the repository.");
  }
  const trustedHost = trustedAbsoluteExecutable(
    hostExecutable,
    root,
    "host executable"
  );
  const trustedNode = trustedAbsoluteExecutable(
    nodeExecutable,
    root,
    "Node executable"
  );
  const home = safeAuthenticationPath(
    environment.HOME,
    root,
    "HOME",
    { requireExistingDirectory: true }
  );

  const output = Object.create(null);
  output.PATH = trustedPath([
    path.dirname(trustedNode),
    path.dirname(trustedHost),
    ...SYSTEM_EXECUTABLE_DIRECTORIES
  ], root);
  output.HOME = home;
  output.TMPDIR = scratch;
  output.TMP = scratch;
  output.TEMP = scratch;
  output.NO_COLOR = "1";
  for (const key of LOCALE_KEYS) {
    const value = boundedEnvironmentValue(environment[key], 160);
    if (/^[A-Za-z0-9_.@-]+$/.test(value)) output[key] = value;
  }
  if (!output.LANG) output.LANG = "C";

  for (const key of HOST_STATE_PATHS[host]) {
    if (!environment[key]) continue;
    output[key] = safeAuthenticationPath(
      environment[key],
      root,
      key
    );
  }
  if (host === "claude-code") {
    const user = boundedEnvironmentValue(environment.USER, 256);
    if (!/^[A-Za-z0-9._-]+$/.test(user)) {
      throw new Error(
        "Claude Code authentication requires a bounded local USER identity."
      );
    }
    output.USER = user;
    output.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
    output.DISABLE_AUTOUPDATER = "1";
  }
  return output;
}

export function removeScratch(scratch) {
  const tempRoot = fs.realpathSync(scratch.tempRoot || os.tmpdir());
  const root = fs.realpathSync(scratch.root);
  if (
    path.dirname(root) !== tempRoot ||
    !path.basename(root).startsWith("kanon-guard-")
  ) {
    throw new Error("Refusing to remove a scratch directory with an unexpected prefix.");
  }
  fs.rmSync(root, { recursive: true, force: false });
}

export function runProgramAsync(command, args, options = {}) {
  return new Promise((resolve) => {
    const timeoutMs = options.timeoutMs || 120_000;
    const signal = options.signal;
    if (signal?.aborted) {
      resolve({
        status: null,
        signal: null,
        timed_out: false,
        overflowed: false,
        error_code: "ABORT_ERR",
        stdout: "",
        stderr: ""
      });
      return;
    }

    let timedOut = false;
    let aborted = false;
    let killTimer = null;
    let timeout = null;
    let child;
    const stop = (reason) => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      if (reason === "timeout") timedOut = true;
      if (reason === "abort") aborted = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, 2_000);
      killTimer.unref();
    };
    const abort = () => stop("abort");

    try {
      child = execFile(
        command,
        args,
        {
          cwd: options.cwd,
          encoding: "utf8",
          // Never inherit the ambient environment implicitly. Host runners
          // provide createMinimalHostEnvironment(); unit callers default to
          // an empty environment.
          env: options.env || Object.create(null),
          maxBuffer: 8 * 1024 * 1024,
          windowsHide: true
        },
        (error, stdout, stderr) => {
          if (timeout) clearTimeout(timeout);
          if (killTimer) clearTimeout(killTimer);
          signal?.removeEventListener("abort", abort);
          const errorCode = aborted
            ? "ABORT_ERR"
            : timedOut
              ? "ETIMEDOUT"
              : typeof error?.code === "string"
                ? error.code
                : null;
          resolve({
            status: error
              ? Number.isInteger(error.code)
                ? error.code
                : null
              : 0,
            signal: error?.signal || child.signalCode || null,
            timed_out: timedOut,
            overflowed:
              error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
            error_code: errorCode,
            stdout: String(stdout || ""),
            stderr: String(stderr || "")
          });
        }
      );
      child.stdin?.end();
      signal?.addEventListener("abort", abort, { once: true });
      timeout = setTimeout(() => stop("timeout"), timeoutMs);
      timeout.unref();
    } catch (error) {
      signal?.removeEventListener("abort", abort);
      resolve({
        status: null,
        signal: null,
        timed_out: false,
        overflowed: false,
        error_code:
          typeof error?.code === "string" ? error.code : "SPAWN_ERROR",
        stdout: "",
        stderr: ""
      });
    }
  });
}

export function summarizeProcess(result) {
  return {
    status: result.status,
    signal: result.signal,
    timed_out: result.timed_out,
    overflowed: result.overflowed,
    error_code: result.error_code,
    stdout_sha256: sha256(result.stdout),
    stderr_sha256: sha256(result.stderr),
    stdout_bytes: Buffer.byteLength(result.stdout),
    stderr_bytes: Buffer.byteLength(result.stderr)
  };
}

export function summarizeSensitiveProcess(result) {
  return {
    status: result.status,
    signal: result.signal,
    timed_out: result.timed_out,
    overflowed: result.overflowed,
    error_code: result.error_code,
    output_redacted: true
  };
}

export function readObservations(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 1024 * 1024) {
      throw new Error("evidence exceeds 1 MiB");
    }
    return fs.readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export function observationsSince(file, count) {
  return readObservations(file).slice(count);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function writeReport(file, report) {
  const lexical = path.resolve(file);
  const parent = canonicalPath(path.dirname(lexical));
  const resolved = path.join(parent, path.basename(lexical));
  ensureRealDirectory(parent);
  let existing = null;
  try {
    existing = fs.lstatSync(resolved);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (
    existing &&
    (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)
  ) {
    throw new Error("Refusing an unsafe existing report file.");
  }
  let descriptor;
  try {
    descriptor = fs.openSync(
      resolved,
      fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_WRONLY |
        (fs.constants.O_NOFOLLOW || 0),
      0o600
    );
    fs.writeFileSync(descriptor, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export function extractSessionIdentifier(output) {
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    try {
      const found = findSessionIdentifier(JSON.parse(line));
      if (found) return found;
    } catch {
      // Non-JSON output does not establish a resumable session identifier.
    }
  }
  return null;
}

function findSessionIdentifier(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSessionIdentifier(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, candidate] of Object.entries(value)) {
    if (
      ["session_id", "sessionId", "thread_id", "threadId"].includes(key) &&
      typeof candidate === "string" &&
      candidate.length > 0 &&
      candidate.length <= 256
    ) {
      return candidate;
    }
    const found = findSessionIdentifier(candidate, depth + 1);
    if (found) return found;
  }
  return null;
}

function canonicalPath(value) {
  const missing = [];
  let current = path.resolve(value);
  while (true) {
    try {
      fs.lstatSync(current);
      return path.join(fs.realpathSync(current), ...missing);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

function canonicalExistingDirectory(value, label) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`Expected an absolute ${label}.`);
  }
  const resolved = fs.realpathSync(value);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Expected a real ${label} directory.`);
  }
  return resolved;
}

function safeAuthenticationPath(
  value,
  repoRoot,
  label,
  options = {}
) {
  const text = boundedEnvironmentValue(value, 4_096);
  if (!text || !path.isAbsolute(text)) {
    throw new Error(`${label} must be an absolute authentication-state path.`);
  }
  const resolved = options.requireExistingDirectory
    ? canonicalExistingDirectory(text, label)
    : canonicalPath(text);
  if (isContained(repoRoot, text) || isContained(repoRoot, resolved)) {
    throw new Error(`${label} must not resolve inside the repository.`);
  }
  return resolved;
}

function trustedAbsoluteExecutable(value, repoRoot, label) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`Expected an absolute ${label}.`);
  }
  const resolved = fs.realpathSync(value);
  const stat = fs.statSync(resolved);
  if (
    isContained(repoRoot, value) ||
    isContained(repoRoot, resolved) ||
    !stat.isFile() ||
    (process.platform !== "win32" && (stat.mode & 0o111) === 0)
  ) {
    throw new Error(`Refusing an untrusted ${label}.`);
  }
  return resolved;
}

function trustedPath(directories, repoRoot) {
  const trusted = [];
  for (const directory of directories) {
    if (!directory || !path.isAbsolute(directory)) continue;
    let resolved;
    try {
      resolved = fs.realpathSync(directory);
      if (!fs.statSync(resolved).isDirectory()) continue;
    } catch {
      continue;
    }
    if (
      isContained(repoRoot, directory) ||
      isContained(repoRoot, resolved) ||
      trusted.includes(resolved)
    ) {
      continue;
    }
    trusted.push(resolved);
  }
  if (!trusted.length) {
    throw new Error("Trusted PATH construction produced no directories.");
  }
  return trusted.join(path.delimiter);
}

function executableNames(command, environment) {
  if (path.basename(command) !== command) {
    throw new Error("Host executable resolution accepts a basename only.");
  }
  if (process.platform !== "win32" || path.extname(command)) {
    return [command];
  }
  const extensions = boundedEnvironmentValue(environment.PATHEXT, 4_096)
    .split(";")
    .filter((value) => /^\.[A-Za-z0-9]+$/.test(value));
  return [command, ...extensions.map((extension) => `${command}${extension}`)];
}

function boundedEnvironmentValue(value, limit) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= limit &&
    !value.includes("\0")
    ? value
    : "";
}

function isContained(root, candidate) {
  const relative = path.relative(root, path.resolve(candidate));
  return (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function ensureRealDirectory(directory) {
  const absolute = path.resolve(directory);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  const segments = absolute.slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean);
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`Expected a real directory: ${current}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      try {
        fs.mkdirSync(current, { mode: 0o700 });
      } catch (mkdirError) {
        if (mkdirError?.code !== "EEXIST") throw mkdirError;
      }
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`Expected a real directory: ${current}`);
      }
    }
  }
}
