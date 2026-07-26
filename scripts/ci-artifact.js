#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveContainedPath } from "../src/path-security.js";
import { atomicWriteContained } from "../src/persistence/safe-fs.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const [command, ...argv] = process.argv.slice(2);

if (command === "verify") {
  verifyCommand(argv, false);
} else if (command === "stamp") {
  verifyCommand(argv, true);
} else if (command === "conform") {
  conformCommand(argv);
} else {
  throw new Error("Usage: ci-artifact.js verify|conform [options]");
}

function verifyCommand(args, writeChecksum) {
  const options = parseOptions(args, [
    "--directory",
    "--expected-sha256"
  ]);
  const tarball = findTarball(options.directory);
  const actual = sha256File(tarball.path);
  if (actual !== options.expectedSha256) {
    throw new Error(
      `Artifact SHA-256 mismatch: expected ${options.expectedSha256}, received ${actual}.`
    );
  }
  const checksumName = `${path.basename(tarball.path)}.sha256`;
  if (writeChecksum) {
    atomicWriteContained(
      tarball.root,
      checksumName,
      `${actual}  ${path.basename(tarball.path)}\n`
    );
  }
  const checksum = resolveContainedPath(
    tarball.root,
    checksumName,
    { type: "file" }
  );
  if (checksum.ok) {
    const declared = fs
      .readFileSync(checksum.path, "utf8")
      .trim()
      .split(/\s+/)[0];
    if (declared !== actual) {
      throw new Error("Artifact checksum sidecar does not match.");
    }
  }
  writeOutput("tarball", tarball.path);
  writeOutput("artifact_sha256", actual);
  process.stdout.write(`${actual}  ${tarball.path}\n`);
}

function conformCommand(args) {
  const options = parseOptions(args, [
    "--directory",
    "--candidate-commit",
    "--candidate-version",
    "--output"
  ]);
  const tarball = findTarball(options.directory);
  const installName =
    `kanon-conformance-${process.platform}-${process.pid}-${Date.now()}`;
  const installRoot = path.join(
    process.env.RUNNER_TEMP || os.tmpdir(),
    installName
  );
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "conform-artifact.js"),
      "--tarball",
      tarball.path,
      "--install-root",
      installRoot,
      "--output",
      path.resolve(options.output),
      "--candidate-commit",
      options.candidateCommit,
      "--candidate-version",
      options.candidateVersion
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_ignore_scripts: "true"
      },
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
      windowsHide: true
    }
  );
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    return;
  }
  const packageRoot = path.join(
    installRoot,
    "node_modules",
    "@mecglandorff",
    "kanon"
  );
  writeOutput("tarball", tarball.path);
  writeOutput("package_root", packageRoot);
  writeOutput("conformance_report", path.resolve(options.output));
}

function findTarball(directory) {
  const root = resolveContainedPath(directory, ".", {
    allowRoot: true,
    type: "directory"
  });
  if (!root.ok) {
    throw new Error(`Artifact directory is unsafe: ${root.reason}`);
  }
  const names = fs
    .readdirSync(root.path, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
    .map((entry) => entry.name);
  if (names.length !== 1) {
    throw new Error(
      `Expected exactly one tarball, found ${names.length}.`
    );
  }
  const file = resolveContainedPath(root.path, names[0], { type: "file" });
  if (!file.ok) {
    throw new Error(`Artifact tarball is unsafe: ${file.reason}`);
  }
  return { ...file, root: root.path };
}

function parseOptions(argv, required) {
  const output = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!required.includes(flag) || !value) {
      throw new Error(`Unknown or incomplete option: ${flag}`);
    }
    output[toCamel(flag.slice(2))] = value;
  }
  for (const flag of required) {
    if (!output[toCamel(flag.slice(2))]) {
      throw new Error(`Missing required option: ${flag}`);
    }
  }
  if (
    output.expectedSha256 &&
    !/^[0-9a-f]{64}$/.test(output.expectedSha256)
  ) {
    throw new Error("Expected artifact SHA-256 must be lowercase hex.");
  }
  return output;
}

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
}
