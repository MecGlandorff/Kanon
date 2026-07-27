import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

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

export function createScratch(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace, { mode: 0o700 });
  return {
    root,
    workspace,
    evidence: path.join(root, "evidence.jsonl")
  };
}

export function removeScratch(scratch) {
  const expected = path.join(os.tmpdir(), "kanon-guard-");
  if (!scratch.root.startsWith(expected)) {
    throw new Error("Refusing to remove a scratch directory with an unexpected prefix.");
  }
  fs.rmSync(scratch.root, { recursive: true, force: false });
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
          env: options.env || process.env,
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
        fs.constants.O_TRUNC |
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
