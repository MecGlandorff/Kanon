#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { atomicWriteContained } from "../src/persistence/safe-fs.js";
import { resolveContainedPath } from "../src/path-security.js";
import { embeddedBuildMetadata } from "./lib/artifact-files.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const checkOnly = argv.length === 1 && argv[0] === "--check";
const requestedVersion = checkOnly ? null : argv.length === 1 ? argv[0] : null;
if (!checkOnly && !requestedVersion) {
  throw new Error("Usage: sync-version.js --check | <exact-semver>");
}

const packageJson = readJson("package.json", 256 * 1024);
const targetVersion = requestedVersion || packageJson.version;
if (!validSemver(targetVersion)) {
  throw new Error("Version must be an exact semantic version without build metadata.");
}

if (!checkOnly) {
  updateJson("package.json", (value) => {
    value.version = targetVersion;
  });
  updateJson("package-lock.json", (value) => {
    value.version = targetVersion;
    if (!value.packages?.[""]) {
      throw new Error("package-lock.json is missing the root package record.");
    }
    value.packages[""].version = targetVersion;
  });
  for (const relative of [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json"
  ]) {
    updateJson(relative, (value) => {
      value.version = targetVersion;
    });
  }
  const source = readText("src/version.js", 256 * 1024);
  const marker = /^export const VERSION = "[^"]+";$/mu;
  if ((source.match(new RegExp(marker.source, "gmu")) || []).length !== 1) {
    throw new Error("src/version.js must contain exactly one VERSION declaration.");
  }
  atomicWriteContained(
    repoRoot,
    "src/version.js",
    source.replace(marker, `export const VERSION = "${targetVersion}";`)
  );
  const generated = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "build-skill.js")],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
      windowsHide: true
    }
  );
  process.stdout.write(generated.stdout || "");
  process.stderr.write(generated.stderr || "");
  if (generated.status !== 0) {
    throw new Error("Generated synchronization failed after version update.");
  }
}

verifySynchronizedVersion(targetVersion);
process.stdout.write(
  `${checkOnly ? "Verified" : "Synchronized"} Kanon version ${targetVersion}.\n`
);

function verifySynchronizedVersion(version) {
  const manifest = readJson("package.json", 256 * 1024);
  const lock = readJson("package-lock.json", 4 * 1024 * 1024);
  const source = readText("src/version.js", 256 * 1024);
  const generatedSource = readText("runtime/src/version.js", 256 * 1024);
  const expectedMetadata = embeddedBuildMetadata(manifest);
  const sourceMetadata = readJson("src/v1/build-metadata.json", 64 * 1024);
  const runtimeMetadata = readJson("runtime/build-metadata.json", 64 * 1024);
  expect(manifest.version === version, "package-version");
  expect(lock.version === version, "lock-version");
  expect(lock.packages?.[""]?.version === version, "lock-root-version");
  expect(
    source.includes(`export const VERSION = "${version}";`),
    "source-version"
  );
  expect(generatedSource === source, "generated-source-version");
  expect(
    JSON.stringify(sourceMetadata) === JSON.stringify(expectedMetadata),
    "source-build-metadata"
  );
  expect(
    JSON.stringify(runtimeMetadata) === JSON.stringify(expectedMetadata),
    "runtime-build-metadata"
  );
  for (const relative of [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json"
  ]) {
    expect(readJson(relative, 256 * 1024).version === version, relative);
  }
  for (const key of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies"
  ]) {
    expect(Object.keys(manifest[key] || {}).length === 0, `zero-${key}`);
    expect(
      Object.keys(lock.packages?.[""]?.[key] || {}).length === 0,
      `lock-zero-${key}`
    );
  }
}

function updateJson(relative, mutate) {
  const value = readJson(relative, 4 * 1024 * 1024);
  mutate(value);
  atomicWriteContained(
    repoRoot,
    relative,
    `${JSON.stringify(value, null, 2)}\n`
  );
}

function readJson(relative, maximumBytes) {
  return JSON.parse(readText(relative, maximumBytes));
}

function readText(relative, maximumBytes) {
  const selected = resolveContainedPath(repoRoot, relative, { type: "file" });
  if (!selected.ok || selected.stat.size > maximumBytes) {
    throw new Error(`Unsafe or oversized version source: ${relative}`);
  }
  return fs.readFileSync(selected.path, "utf8");
}

function validSemver(value) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(
    value
  );
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(`kanon-version-sync:${label}`);
  }
}
