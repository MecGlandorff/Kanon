import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function ensureCheckout(item, options) {
  const cacheRoot = path.resolve(options.cacheRoot);
  fs.mkdirSync(cacheRoot, { recursive: true });
  const target = path.join(cacheRoot, repositoryCacheName(item.repository));
  const gitDir = path.join(target, ".git");
  if (fs.existsSync(target) && !fs.existsSync(gitDir)) {
    throw new Error(
      `${item.id}: corpus cache target exists but is not a Git checkout: ${target}`
    );
  }
  if (!fs.existsSync(target)) {
    if (!options.fetch) {
      throw new Error(
        `${item.id}: pinned checkout is not cached and --no-fetch was used.`
      );
    }
    clonePinned(item, target);
  }
  const current = git(target, ["rev-parse", "HEAD"], { allowFailure: true });
  if (current.status === 0 && current.stdout.trim() === item.revision) {
    assertCleanCache(item, target);
    return target;
  }
  if (!options.fetch && !hasCommit(target, item.revision)) {
    throw new Error(
      `${item.id}: pinned revision is not cached and --no-fetch was used.`
    );
  }
  if (!hasCommit(target, item.revision)) {
    git(target, ["fetch", "--depth", "1", "origin", item.revision]);
  }
  assertCleanCache(item, target);
  git(target, ["checkout", "--detach", item.revision]);
  return target;
}

function clonePinned(item, target) {
  const temporary = `${target}.tmp-${process.pid}`;
  if (fs.existsSync(temporary)) {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  try {
    runGit(
      [
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        "--no-checkout",
        item.repository,
        temporary
      ],
      process.cwd()
    );
    if (!hasCommit(temporary, item.revision)) {
      git(temporary, ["fetch", "--depth", "1", "origin", item.revision]);
    }
    git(temporary, ["checkout", "--detach", item.revision]);
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function hasCommit(root, revision) {
  return git(root, ["cat-file", "-e", `${revision}^{commit}`], {
    allowFailure: true
  }).status === 0;
}

function assertCleanCache(item, root) {
  const status = git(root, ["status", "--porcelain"]).stdout.trim();
  if (status) {
    throw new Error(
      `${item.id}: refusing to replace a modified corpus cache checkout.`
    );
  }
}

function git(root, args, options = {}) {
  return runGit(["-C", root, ...args], root, options);
}

function runGit(args, cwd, options = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (${result.status}): ${
        result.stderr.trim() || result.error?.message || "unknown error"
      }`
    );
  }
  return result;
}

function repositoryCacheName(repository) {
  const parsed = new URL(repository);
  return parsed.pathname.replace(/^\/|\.git$/g, "").replaceAll("/", "__");
}
