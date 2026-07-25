import { spawnSync } from "node:child_process";
import { isSensitivePath } from "./scanner.js";

export function inspectGit(root, evidence) {
  const inside = runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return {
      found: false,
      branch: null,
      head: null,
      dirty: null,
      change_count: 0,
      changes: [],
      sensitive_changes_skipped: 0,
      recent_commits: [],
      evidence: []
    };
  }

  const branchResult = runGit(root, ["branch", "--show-current"]);
  const headResult = runGit(root, ["rev-parse", "--short=12", "HEAD"]);
  const prefixResult = runGit(root, ["rev-parse", "--show-prefix"]);
  const prefix = prefixResult.ok ? prefixResult.stdout.trim() : "";
  const statusResult = runGit(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=normal",
    "--",
    "."
  ]);
  const logResult = runGit(root, ["log", "-5", "--pretty=format:%h%x00%cs%x00%s%x00", "--", "."]);
  const parsedChanges = statusResult.ok ? parseStatus(statusResult.stdout, prefix) : [];
  const changes = parsedChanges.filter((change) => !isSensitivePath(change.path));
  const sensitiveChangesSkipped = parsedChanges.length - changes.length;
  const recentCommits = logResult.ok ? parseLog(logResult.stdout) : [];
  const branch = branchResult.ok ? branchResult.stdout.trim() || null : null;
  const head = headResult.ok ? headResult.stdout.trim() || null : null;
  const evidenceId = evidence.add(
    "git",
    ".git",
    `Git repository detected${branch ? ` on branch ${branch}` : ""}; ${parsedChanges.length} working-tree change(s).`
  );

  return {
    found: true,
    branch,
    head,
    dirty: parsedChanges.length > 0,
    change_count: parsedChanges.length,
    changes,
    sensitive_changes_skipped: sensitiveChangesSkipped,
    recent_commits: recentCommits,
    evidence: [evidenceId]
  };
}

function runGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || ""
  };
}

function parseStatus(output, prefix = "") {
  const entries = output.split("\0").filter(Boolean);
  const changes = [];
  for (let index = 0; index < entries.length && changes.length < 100; index += 1) {
    const entry = entries[index];
    const indexStatus = entry[0] || " ";
    const worktreeStatus = entry[1] || " ";
    const path = stripRepoPrefix(entry.slice(3), prefix);
    if (indexStatus === "R" || indexStatus === "C") {
      index += 1;
    }
    if (path === null) {
      continue;
    }
    changes.push({
      path,
      index: indexStatus,
      worktree: worktreeStatus
    });
  }
  return changes;
}

function stripRepoPrefix(relPath, prefix) {
  if (!prefix) {
    return relPath;
  }
  return relPath.startsWith(prefix) ? relPath.slice(prefix.length) : null;
}

function parseLog(output) {
  const fields = output
    .split("\0")
    .map((field) => field.trim())
    .filter((field) => field !== "");
  const commits = [];
  for (let index = 0; index + 2 < fields.length; index += 3) {
    commits.push({
      hash: fields[index],
      date: fields[index + 1],
      subject: fields[index + 2]
    });
  }
  return commits;
}
