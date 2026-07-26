import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runGit } from "../../../src/git-runner.js";
import {
  resolveContainedPath,
  sanitizeFilenameComponent
} from "../../../src/path-security.js";

export function ensureCheckout(item, options) {
  const cacheRoot = ensureCacheRoot(options.cacheRoot);
  const cacheName = repositoryCacheName(
    item.repository,
    item.revision
  );
  const target = resolveContainedPath(cacheRoot, cacheName, {
    type: "directory"
  });
  if (target.ok) {
    const gitMetadata = resolveContainedPath(
      cacheRoot,
      `${cacheName}/.git`,
      { type: "any" }
    );
    if (gitMetadata.ok) {
      throw new Error(
        `${item.id}: cached analysis trees must not retain Git metadata.`
      );
    }
    return target.path;
  }
  if (target.status !== "missing") {
    throw new Error(
      `${item.id}: unsafe corpus cache target: ${target.reason}`
    );
  }
  if (!options.fetch) {
    throw new Error(
      `${item.id}: pinned checkout is not cached and --no-fetch was used.`
    );
  }

  const temporaryName =
    `.${cacheName}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const temporary = resolveContainedPath(cacheRoot, temporaryName, {
    type: "directory"
  });
  if (temporary.status !== "missing") {
    throw new Error(`${item.id}: temporary checkout path is not clean.`);
  }

  try {
    checkedGit(
      null,
      [
        "init",
        "--quiet",
        "--template=",
        temporary.path
      ],
      {
        cwd: cacheRoot,
        timeoutMs: options.gitTimeoutMs ?? 60_000,
        maxOutputBytes: options.gitMaxOutputBytes
      },
      `${item.id}: initialize isolated checkout`
    );
    rejectExecutableLocalConfig(item, temporary.path, options);
    checkedGit(
      temporary.path,
      [
        "fetch",
        "--no-tags",
        "--depth",
        "1",
        item.repository,
        item.revision
      ],
      gitOptions(options),
      `${item.id}: fetch pinned revision`
    );
    rejectExecutableLocalConfig(item, temporary.path, options);
    checkedGit(
      temporary.path,
      ["checkout", "--detach", "--force", item.revision],
      {
        ...gitOptions(options),
        noLazyFetch: true
      },
      `${item.id}: checkout`
    );
    verifyMaterialization(item, temporary.path, options);

    const gitDirectory = resolveContainedPath(
      temporary.path,
      ".git",
      { type: "directory" }
    );
    if (!gitDirectory.ok) {
      throw new Error(
        `${item.id}: isolated checkout has unsafe Git metadata.`
      );
    }
    fs.rmSync(gitDirectory.path, { recursive: true, force: false });
    fs.renameSync(temporary.path, target.path);
    return target.path;
  } catch (error) {
    const cleanup = resolveContainedPath(cacheRoot, temporaryName, {
      type: "directory"
    });
    if (cleanup.ok) {
      fs.rmSync(cleanup.path, { recursive: true, force: false });
    }
    throw error;
  }
}

function rejectExecutableLocalConfig(item, root, options) {
  const result = runGit(
    root,
    [
      "config",
      "--local",
      "--get-regexp",
      "^(filter\\.|core\\.fsmonitor$|core\\.hooksPath$|include\\.|includeIf\\.)"
    ],
    gitOptions(options)
  );
  if (result.timeout || result.overflow || result.error) {
    throw new Error(
      `${item.id}: local Git configuration inspection failed: ${result.diagnostic}`
    );
  }
  if (result.status === 0 && result.stdout.trim()) {
    throw new Error(
      `${item.id}: checkout contains executable or included local Git configuration.`
    );
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `${item.id}: local Git configuration inspection exited ${result.status}.`
    );
  }
}

function verifyMaterialization(item, root, options) {
  const head = checkedGit(
    root,
    ["rev-parse", "HEAD"],
    gitOptions(options),
    `${item.id}: verify HEAD`
  ).stdout.trim();
  if (head !== item.revision) {
    throw new Error(
      `${item.id}: materialized ${head}, expected ${item.revision}.`
    );
  }
  const status = checkedGit(
    root,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    gitOptions(options),
    `${item.id}: verify cleanliness`
  ).stdout;
  if (status.trim()) {
    throw new Error(`${item.id}: materialized checkout is not clean.`);
  }
}

function checkedGit(root, args, options, context) {
  const result = runGit(root, args, options);
  if (!result.ok) {
    throw new Error(
      `${context} failed: ${result.diagnostic}${
        result.stderr.trim() ? ` ${result.stderr.trim()}` : ""
      }`
    );
  }
  return result;
}

function gitOptions(options) {
  return {
    timeoutMs: options.gitTimeoutMs ?? 60_000,
    maxOutputBytes: options.gitMaxOutputBytes
  };
}

function ensureCacheRoot(value) {
  const cacheRoot = path.resolve(value);
  const parent = path.dirname(cacheRoot);
  const parentRoot = resolveContainedPath(parent, ".", {
    allowRoot: true,
    type: "directory"
  });
  if (!parentRoot.ok) {
    throw new Error(
      `Corpus cache parent is unsafe: ${parentRoot.reason}`
    );
  }
  const name = path.basename(cacheRoot);
  let resolved = resolveContainedPath(parentRoot.root, name, {
    type: "directory"
  });
  if (resolved.status === "missing") {
    fs.mkdirSync(resolved.path, { recursive: false, mode: 0o700 });
    resolved = resolveContainedPath(parentRoot.root, name, {
      type: "directory"
    });
  }
  if (!resolved.ok) {
    throw new Error(`Corpus cache root is unsafe: ${resolved.reason}`);
  }
  return resolved.path;
}

export function repositoryCacheName(repository, revision) {
  const parsed = new URL(repository);
  const repositoryName = sanitizeFilenameComponent(
    parsed.pathname.replace(/^\/|\.git$/g, "").replaceAll("/", "__"),
    "repository"
  ).slice(0, 48);
  const identity = crypto
    .createHash("sha256")
    .update(`${repository}\0${revision}`)
    .digest("hex")
    .slice(0, 16);
  return `${repositoryName}__${revision.slice(0, 12)}__${identity}`;
}
