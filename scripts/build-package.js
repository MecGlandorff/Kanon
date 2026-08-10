#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureContainedDirectory,
  atomicWriteContained
} from "../src/persistence/safe-fs.js";
import { resolveContainedPath } from "../src/path-security.js";
import { safeJsonStringify } from "../src/trust.js";
import { VERSION } from "../src/version.js";
import { publicSkillFiles } from "./lib/artifact-files.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const outputRoot = resolveOutput(process.argv.slice(2));
const packageSource = resolveContainedPath(repoRoot, "package.json", {
  type: "file"
});
if (!packageSource.ok || packageSource.stat.size > 256 * 1024) {
  throw new Error(
    `Unsafe package.json source: ${
      packageSource.reason || "file exceeds 256 KiB"
    }`
  );
}
const sourcePackage = JSON.parse(
  fs.readFileSync(packageSource.path, "utf8")
);

if (sourcePackage.version !== VERSION) {
  throw new Error(
    `Version mismatch: package.json=${sourcePackage.version}, runtime=${VERSION}.`
  );
}

const outputBoundary = prepareEmptyOutput(outputRoot);
const copied = [];
for (const sourceRelative of publicSkillFiles(repoRoot)) {
  copyAllowedFile(
    repoRoot,
    sourceRelative,
    outputBoundary.root,
    sourceRelative
  );
  copied.push(sourceRelative);
}
for (const [sourceRelative, destinationRelative] of [
  ["packaging/README.md", "README.md"],
  ["SECURITY.md", "SECURITY.md"],
  ["LICENSE", "LICENSE"]
]) {
  copyAllowedFile(
    repoRoot,
    sourceRelative,
    outputBoundary.root,
    destinationRelative
  );
  copied.push(destinationRelative);
}
atomicWriteContained(
  outputBoundary.root,
  "package.json",
  `${safeJsonStringify(publicManifest(sourcePackage))}\n`
);
copied.push("package.json");

const sbom = buildSbom(outputBoundary.root, copied);
atomicWriteContained(
  outputBoundary.root,
  "SBOM.json",
  `${safeJsonStringify(sbom)}\n`
);
copied.push("SBOM.json");
const manifest = copied
  .sort()
  .map((relative) =>
    `${sha256File(outputBoundary.root, relative)}  ${relative}`
  )
  .join("\n");
atomicWriteContained(
  outputBoundary.root,
  "MANIFEST.sha256",
  `${manifest}\n`
);

process.stdout.write(`Built skill-only package at ${outputBoundary.root}\n`);

function resolveOutput(argv) {
  let output = path.join(repoRoot, "dist", "npm");
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--output") {
      throw new Error(`Unknown option: ${argv[index]}`);
    }
    const value = argv[++index];
    if (!value || value.startsWith("--")) {
      throw new Error("--output requires a directory.");
    }
    output = path.resolve(value);
  }
  return output;
}

function prepareEmptyOutput(output) {
  const defaultOutput = path.join(repoRoot, "dist", "npm");
  const tempRootResult = resolveContainedPath(os.tmpdir(), ".", {
    allowRoot: true,
    type: "directory"
  });
  if (!tempRootResult.ok) {
    throw new Error(`Temporary root is unsafe: ${tempRootResult.reason}`);
  }
  const lexicalTempRoot = path.resolve(os.tmpdir());
  const usingDefault = output === defaultOutput;
  const base = usingDefault ? repoRoot : tempRootResult.root;
  // Runners may expose the temporary root through a filesystem alias.
  const candidateRoots = usingDefault
    ? [repoRoot]
    : [lexicalTempRoot, tempRootResult.root];
  const relative = candidateRoots
    .map((root) => path.relative(root, output).replaceAll("\\", "/"))
    .find((candidate) =>
      candidate &&
      candidate !== "." &&
      candidate !== ".." &&
      !candidate.startsWith("../") &&
      !path.isAbsolute(candidate)
    );
  if (relative === undefined) {
    throw new Error(
      "Package output must be dist/npm or a child of the temporary directory."
    );
  }
  let resolved = resolveContainedPath(base, relative, {
    type: "directory"
  });
  if (resolved.status === "missing") {
    resolved = ensureContainedDirectory(base, relative);
  }
  if (!resolved.ok) {
    throw new Error(`Unsafe package output: ${resolved.reason}`);
  }
  const entries = fs.readdirSync(resolved.path);
  if (entries.length) {
    throw new Error(
      `Package output must be a new or empty directory: ${resolved.path}`
    );
  }
  return {
    ...resolved,
    root: resolved.path
  };
}

function copyAllowedFile(
  sourceRoot,
  sourceRelative,
  destinationRoot,
  destinationRelative
) {
  const source = resolveContainedPath(sourceRoot, sourceRelative, {
    type: "file"
  });
  if (!source.ok) {
    throw new Error(
      `Unsafe or missing package source ${sourceRelative}: ${source.reason}`
    );
  }
  const parent = path.posix.dirname(destinationRelative);
  if (parent !== ".") {
    ensureContainedDirectory(destinationRoot, parent);
  }
  const contents = fs.readFileSync(source.path);
  atomicWriteContained(destinationRoot, destinationRelative, contents);
  if (process.platform !== "win32") {
    const destination = resolveContainedPath(
      destinationRoot,
      destinationRelative,
      { type: "file" }
    );
    fs.chmodSync(destination.path, source.stat.mode & 0o777);
  }
}

function buildSbom(root, files) {
  return {
    schema: "kanon-artifact-sbom-v1",
    version: VERSION,
    files: files.sort().map((relative) => ({
      path: relative,
      sha256: sha256File(root, relative)
    }))
  };
}

function sha256File(root, relative) {
  const file = resolveContainedPath(root, relative, { type: "file" });
  if (!file.ok) {
    throw new Error(`Cannot hash artifact file ${relative}: ${file.reason}`);
  }
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file.path))
    .digest("hex");
}

function publicManifest(source) {
  return {
    name: source.name,
    version: source.version,
    description: source.description,
    type: source.type,
    repository: source.repository,
    bugs: source.bugs,
    homepage: source.homepage,
    keywords: source.keywords,
    author: source.author,
    license: source.license,
    engines: source.engines,
    publishConfig: source.publishConfig
  };
}
