import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { runGit } from "../../../src/git-runner.js";
import { resolveContainedPath } from "../../../src/path-security.js";

const ALLOWED_POST_FREEZE = [
  "eval/release-corpus.json",
  "eval/releases/"
];

export function assertNoCorpusOverlap(releaseCorpus, developmentCorpus) {
  const developmentIds = new Set(
    developmentCorpus.cases.map((item) => item.id)
  );
  const developmentRepositories = new Set(
    developmentCorpus.cases.map((item) =>
      normalizeRepository(item.repository)
    )
  );
  const developmentRevisions = new Set(
    developmentCorpus.cases.map((item) => item.revision)
  );
  const overlaps = releaseCorpus.cases.filter(
    (item) =>
      developmentIds.has(item.id) ||
      developmentRepositories.has(normalizeRepository(item.repository)) ||
      developmentRevisions.has(item.revision)
  );
  if (overlaps.length > 0) {
    throw new Error(
      `Release corpus overlaps visible development data: ${overlaps
        .map((item) => item.id)
        .join(", ")}.`
    );
  }
}

export function assertReleasePolicyMatches(
  releaseCorpus,
  developmentCorpus
) {
  if (
    !isDeepStrictEqual(
      releaseCorpus.policy,
      developmentCorpus.policy
    )
  ) {
    throw new Error(
      "Release policy differs from the policy frozen with the development manifest."
    );
  }
}

export function assertFrozenReleaseCandidate(repoRoot, corpus) {
  const candidate = corpus.release.candidate_commit;
  const head = git(repoRoot, ["rev-parse", "HEAD"]).trim();
  git(repoRoot, ["merge-base", "--is-ancestor", candidate, head]);
  if (
    gitStatus(repoRoot, [
      "cat-file",
      "-e",
      `${candidate}:eval/release-corpus.json`
    ]) === 0
  ) {
    throw new Error(
      "Release corpus existed at the candidate commit and is not held out."
    );
  }

  const changedAfterFreeze = lines(
    git(repoRoot, ["diff", "--name-only", `${candidate}..${head}`])
  ).filter((file) => !isAllowedPostFreeze(file));
  if (changedAfterFreeze.length > 0) {
    throw new Error(
      `Product files changed after candidate freeze: ${changedAfterFreeze.join(
        ", "
      )}.`
    );
  }

  const dirty = lines(
    git(repoRoot, ["status", "--porcelain", "--untracked-files=all"])
  )
    .map(statusPath)
    .filter((file) => file && !isAllowedPostFreeze(file));
  if (dirty.length > 0) {
    throw new Error(
      `Working tree has post-freeze changes: ${dirty.join(", ")}.`
    );
  }

  const packageFile = resolveContainedPath(repoRoot, "package.json", {
    type: "file"
  });
  if (!packageFile.ok || packageFile.stat.size > 256 * 1024) {
    throw new Error(
      `Release package.json is unsafe: ${
        packageFile.reason || "file exceeds 256 KiB"
      }`
    );
  }
  const packageVersion = JSON.parse(
    fs.readFileSync(packageFile.path, "utf8")
  ).version;
  if (packageVersion !== corpus.release.candidate_version) {
    throw new Error(
      `Release candidate version mismatch: manifest=${corpus.release.candidate_version}, package=${packageVersion}.`
    );
  }
}

function normalizeRepository(repository) {
  return String(repository).toLowerCase().replace(/\.git$/, "");
}

function isAllowedPostFreeze(file) {
  const normalized = file.replaceAll("\\", "/");
  return ALLOWED_POST_FREEZE.some((allowed) =>
    allowed.endsWith("/")
      ? normalized.startsWith(allowed)
      : normalized === allowed
  );
}

function statusPath(line) {
  const value = line.slice(3).trim();
  const renameTarget = value.includes(" -> ")
    ? value.split(" -> ").at(-1)
    : value;
  return renameTarget.replace(/^"|"$/g, "");
}

function lines(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function git(root, args) {
  const result = runGit(root, args, {
    timeoutMs: 10_000,
    maxOutputBytes: 8 * 1024 * 1024
  });
  if (!result.ok) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.diagnostic} ${
        result.stderr.trim()
      }`
    );
  }
  return result.stdout;
}

function gitStatus(root, args) {
  const result = runGit(root, args, {
    timeoutMs: 10_000,
    maxOutputBytes: 8 * 1024 * 1024
  });
  if (result.timeout || result.overflow || result.error) {
    throw new Error(`Git guard observation failed: ${result.diagnostic}`);
  }
  return result.status;
}
