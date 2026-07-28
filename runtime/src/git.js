import { runGit } from "./git-runner.js";
import { isSensitivePath } from "./scanner.js";
import { safeTerminalText } from "./trust.js";

const RETAINED_CHANGE_LIMIT = 100;

/**
 * @typedef {{
 *   path: string,
 *   index: string,
 *   worktree: string,
 *   trust: "repository-untrusted"
 * }} GitChange
 * @typedef {{
 *   hash: string,
 *   date: string,
 *   subject: string,
 *   trust: "repository-untrusted"
 * }} GitCommit
 * @typedef {{
 *   operation: string,
 *   kind: string,
 *   message: string,
 *   status?: number | null,
 *   signal?: NodeJS.Signals | null,
 *   timeout?: boolean,
 *   overflow?: boolean,
 *   stderr?: string
 * }} GitDiagnostic
 * @typedef {{
 *   found: boolean,
 *   branch: string | null,
 *   head: string | null,
 *   dirty: boolean | null,
 *   change_count: number | null,
 *   change_count_exact: boolean,
 *   changes: GitChange[],
 *   changes_truncated: boolean,
 *   sensitive_changes_skipped: number,
 *   recent_commits: GitCommit[],
 *   observation_complete: boolean,
 *   diagnostics: GitDiagnostic[],
 *   trust: "repository-untrusted" | "kanon-generated",
 *   evidence: string[]
 * }} GitInspection
 * @typedef {{
 *   enabled?: boolean,
 *   timeoutMs?: number,
 *   maxOutputBytes?: number,
 *   gitBinary?: string,
 *   runner?: typeof runGit
 * }} GitInspectionOptions
 * @typedef {{
 *   total: number,
 *   changes: GitChange[],
 *   sensitiveSkipped: number,
 *   changesTruncated: boolean
 * }} ParsedStatus
 */

/**
 * @param {string} root
 * @param {import("./evidence.js").EvidenceBook} evidence
 * @param {GitInspectionOptions} [options]
 * @returns {GitInspection}
 */
export function inspectGit(root, evidence, options = {}) {
  if (options.enabled === false) {
    return unavailableGit(
      "Git inspection was disabled for this analysis.",
      "disabled"
    );
  }

  /** @type {{name: string, result: ReturnType<typeof runGit>}[]} */
  const observations = [];
  const runner = options.runner || runGit;
  /**
   * @param {string} name
   * @param {string[]} args
   */
  const observe = (name, args) => {
    const result = runner(root, args, {
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs }),
      ...(options.maxOutputBytes === undefined
        ? {}
        : { maxOutputBytes: options.maxOutputBytes }),
      ...(options.gitBinary === undefined
        ? {}
        : { gitBinary: options.gitBinary })
    });
    observations.push({ name, result });
    return result;
  };

  const inside = observe(
    "repository detection",
    ["rev-parse", "--is-inside-work-tree"]
  );
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return unavailableGit(
      inside.ok
        ? "Git did not identify the selected root as a work tree."
        : inside.diagnostic,
      inside.ok ? "not-a-work-tree" : failureKind(inside),
      diagnosticRecord("repository detection", inside)
    );
  }

  const branchResult = observe(
    "branch",
    ["branch", "--show-current"]
  );
  const headResult = observe(
    "HEAD",
    ["rev-parse", "--short=12", "HEAD"]
  );
  const prefixResult = observe(
    "repository prefix",
    ["rev-parse", "--show-prefix"]
  );
  const prefix = prefixResult.ok ? prefixResult.stdout.trim() : "";
  const statusResult = observe("status", [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=normal",
    "--",
    "."
  ]);
  const logResult = observe(
    "recent commits",
    ["log", "-5", "--pretty=format:%h%x00%cs%x00%s%x00", "--", "."]
  );

  const parsed = statusResult.ok
    ? parseStatus(statusResult.stdout, prefix)
    : null;
  const recentCommits = logResult.ok ? parseLog(logResult.stdout) : [];
  const branch = branchResult.ok
    ? branchResult.stdout.trim() || null
    : null;
  const head = headResult.ok
    ? headResult.stdout.trim() || null
    : null;
  const failures = observations
    .filter((item) => !item.result.ok)
    .map((item) => diagnosticRecord(item.name, item.result));
  const changeCount = parsed?.total ?? null;
  const evidenceId = evidence.add(
    "git",
    ".git",
    statusResult.ok
      ? `Git repository detected; status reported ${changeCount} working-tree change(s).`
      : "Git repository detected, but working-tree status is Unknown."
  );

  return {
    found: true,
    branch,
    head,
    dirty: parsed ? parsed.total > 0 : null,
    change_count: changeCount,
    change_count_exact: statusResult.ok,
    changes: parsed?.changes || [],
    changes_truncated: parsed?.changesTruncated || false,
    sensitive_changes_skipped: parsed?.sensitiveSkipped || 0,
    recent_commits: recentCommits,
    observation_complete: failures.length === 0,
    diagnostics: failures,
    trust: "repository-untrusted",
    evidence: [evidenceId]
  };
}

export { runGit } from "./git-runner.js";

/**
 * @param {string} reason
 * @param {string} kind
 * @param {GitDiagnostic | null} [diagnostic]
 * @returns {GitInspection}
 */
function unavailableGit(reason, kind, diagnostic = null) {
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
    diagnostics: diagnostic ? [diagnostic] : [
      {
        operation: "repository detection",
        kind,
        message: reason
      }
    ],
    trust: "kanon-generated",
    evidence: []
  };
}

/**
 * @param {string} output
 * @param {string} [prefix]
 * @returns {ParsedStatus}
 */
function parseStatus(output, prefix = "") {
  const entries = output.split("\0");
  /** @type {GitChange[]} */
  const changes = [];
  let total = 0;
  let sensitiveSkipped = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    const indexStatus = entry[0] || " ";
    const worktreeStatus = entry[1] || " ";
    const path = stripRepoPrefix(entry.slice(3), prefix);
    if (indexStatus === "R" || indexStatus === "C") {
      index += 1;
    }
    if (path === null) {
      continue;
    }
    total += 1;
    if (isSensitivePath(path)) {
      sensitiveSkipped += 1;
      continue;
    }
    if (changes.length < RETAINED_CHANGE_LIMIT) {
      changes.push({
        path: safeTerminalText(path),
        index: indexStatus,
        worktree: worktreeStatus,
        trust: "repository-untrusted"
      });
    }
  }
  return {
    total,
    changes,
    sensitiveSkipped,
    changesTruncated: total - sensitiveSkipped > changes.length
  };
}

/**
 * @param {string} relPath
 * @param {string} prefix
 * @returns {string | null}
 */
function stripRepoPrefix(relPath, prefix) {
  if (!prefix) {
    return relPath;
  }
  return relPath.startsWith(prefix)
    ? relPath.slice(prefix.length)
    : null;
}

/**
 * @param {string} output
 * @returns {GitCommit[]}
 */
function parseLog(output) {
  const fields = output.split("\0");
  /** @type {GitCommit[]} */
  const commits = [];
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const hash = fields[index]?.trim();
    const date = fields[index + 1]?.trim();
    const subject = fields[index + 2]?.trim();
    if (!hash || !date) {
      continue;
    }
    commits.push({
      hash,
      date,
      subject: safeTerminalText(subject || ""),
      trust: "repository-untrusted"
    });
  }
  return commits;
}

/**
 * @param {string} operation
 * @param {ReturnType<typeof runGit>} result
 * @returns {GitDiagnostic}
 */
function diagnosticRecord(operation, result) {
  return {
    operation,
    kind: failureKind(result),
    status: result.status,
    signal: result.signal,
    timeout: result.timeout,
    overflow: result.overflow,
    stderr: safeTerminalText(result.stderr.trim().slice(0, 2_000)),
    message: result.diagnostic
  };
}

/**
 * @param {ReturnType<typeof runGit>} result
 * @returns {string}
 */
function failureKind(result) {
  if (result.timeout) {
    return "timeout";
  }
  if (result.overflow) {
    return "overflow";
  }
  if (result.status !== 0) {
    return "nonzero-exit";
  }
  return "execution-error";
}
