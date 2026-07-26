import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const DEFAULT_GIT_TIMEOUT_MS = 2_000;
export const DEFAULT_GIT_OUTPUT_BYTES = 8 * 1024 * 1024;

let emptyHooksPath;

export function runGit(root, args, options = {}) {
  const timeoutMs = boundedInteger(
    options.timeoutMs,
    DEFAULT_GIT_TIMEOUT_MS,
    100,
    60_000
  );
  const maxOutputBytes = boundedInteger(
    options.maxOutputBytes,
    DEFAULT_GIT_OUTPUT_BYTES,
    1_024,
    32 * 1024 * 1024
  );
  const gitRoot = root ? path.resolve(root) : process.cwd();
  const commandCwd = options.cwd
    ? path.resolve(options.cwd)
    : gitRoot;
  const gitBinary = resolveGitBinary(options.gitBinary, [
    gitRoot,
    commandCwd
  ]);
  const started = Date.now();
  const result = spawnSync(
    gitBinary,
    [
      ...(options.prefixArgs || []),
      "-c",
      "core.fsmonitor=false",
      "-c",
      `core.hooksPath=${getEmptyHooksPath()}`,
      "-c",
      "pager.branch=false",
      "-c",
      "pager.log=false",
      "-c",
      "pager.status=false",
      ...(options.noLazyFetch ? ["-c", "extensions.partialClone="] : []),
      ...(root ? ["-C", gitRoot] : []),
      ...args
    ],
    {
      cwd: commandCwd,
      encoding: "buffer",
      env: hardenedGitEnvironment(options.env, options.noLazyFetch),
      input: options.input,
      maxBuffer: maxOutputBytes,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      windowsHide: true
    }
  );
  const stdoutBuffer = Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout || "");
  const stderrBuffer = Buffer.isBuffer(result.stderr)
    ? result.stderr
    : Buffer.from(result.stderr || "");
  const outputBytes = stdoutBuffer.length + stderrBuffer.length;
  const timedOut =
    result.error?.code === "ETIMEDOUT" ||
    (
      result.signal !== null &&
      Date.now() - started >= timeoutMs
    );
  const overflowed =
    result.error?.code === "ENOBUFS" ||
    outputBytes > maxOutputBytes;
  const status = Number.isInteger(result.status) ? result.status : null;
  const errorMessage = result.error?.message || null;

  return {
    ok: status === 0 && !timedOut && !overflowed && !result.error,
    binary: gitBinary,
    status,
    signal: result.signal || null,
    stdout: stdoutBuffer.toString(options.encoding || "utf8"),
    stderr: stderrBuffer.toString(options.encoding || "utf8"),
    timeout: timedOut,
    overflow: overflowed,
    output_bytes: outputBytes,
    output_limit_bytes: maxOutputBytes,
    timeout_ms: timeoutMs,
    duration_ms: Date.now() - started,
    error: errorMessage,
    diagnostic: diagnosticFor({
      status,
      signal: result.signal,
      timedOut,
      overflowed,
      errorMessage
    })
  };
}

export function assertGit(result, context = "Git command") {
  if (result.ok) {
    return result;
  }
  throw new Error(
    `${context} failed: ${result.diagnostic}${
      result.stderr.trim() ? ` ${result.stderr.trim()}` : ""
    }`
  );
}

export function hardenedGitEnvironment(extra = {}, noLazyFetch = false) {
  const env = {
    ...process.env,
    ...extra
  };
  for (const key of Object.keys(env)) {
    if (
      /^(?:GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)|GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CEILING_DIRECTORIES|EXEC_PATH|TEMPLATE_DIR|SSH_COMMAND|EXTERNAL_DIFF|DIFF_OPTS|ASKPASS))$/.test(
        key
      ) ||
      key === "SSH_ASKPASS"
    ) {
      delete env[key];
    }
  }
  Object.assign(env, {
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: os.devNull,
    GIT_EDITOR: "true",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_SEQUENCE_EDITOR: "true",
    GIT_TERMINAL_PROMPT: "0",
    PAGER: "cat"
  });
  if (noLazyFetch) {
    env.GIT_NO_LAZY_FETCH = "1";
  }
  return env;
}

function getEmptyHooksPath() {
  if (emptyHooksPath) {
    return emptyHooksPath;
  }
  const name = `kanon-empty-hooks-${process.pid}-${crypto
    .randomBytes(8)
    .toString("hex")}`;
  emptyHooksPath = path.join(os.tmpdir(), name);
  fs.mkdirSync(emptyHooksPath, { mode: 0o700 });
  return emptyHooksPath;
}

function resolveGitBinary(explicit, rejectedRoots) {
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!path.isAbsolute(explicit) || !isExecutableFile(resolved)) {
      return resolved;
    }
    return resolved;
  }
  const pathEntries = String(process.env.PATH || "")
    .split(path.delimiter);
  const canonicalRejectedRoots = rejectedRoots.map((root) => {
    try {
      return fs.realpathSync(path.resolve(root));
    } catch {
      return path.resolve(root);
    }
  });
  const names = process.platform === "win32"
    ? gitExecutableNames()
    : ["git"];
  for (const entry of pathEntries) {
    const directory = path.resolve(entry || process.cwd());
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (!isExecutableFile(candidate)) {
        continue;
      }
      let canonical;
      try {
        canonical = fs.realpathSync(candidate);
      } catch {
        continue;
      }
      if (
        canonicalRejectedRoots.some((root) =>
          isWithin(root, canonical)
        )
      ) {
        continue;
      }
      return canonical;
    }
  }
  return path.join(
    os.tmpdir(),
    `kanon-git-not-found-${process.pid}`
  );
}

function gitExecutableNames() {
  const extensions = String(
    process.env.PATHEXT || ".EXE;.CMD;.BAT"
  )
    .split(";")
    .filter(Boolean);
  return ["git", ...extensions.map((extension) =>
    `git${extension.toLowerCase()}`
  )];
}

function isExecutableFile(candidate) {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) {
      return false;
    }
    fs.accessSync(
      candidate,
      process.platform === "win32"
        ? fs.constants.F_OK
        : fs.constants.X_OK
    );
    return true;
  } catch {
    return false;
  }
}

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

function diagnosticFor(input) {
  if (input.timedOut) {
    return "Git observation timed out.";
  }
  if (input.overflowed) {
    return "Git observation exceeded its output limit.";
  }
  if (input.errorMessage) {
    return `Git could not be started: ${input.errorMessage}`;
  }
  if (input.status !== 0) {
    return `Git exited with status ${String(input.status)}${
      input.signal ? ` and signal ${input.signal}` : ""
    }.`;
  }
  return "Git observation failed.";
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}
