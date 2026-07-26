#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { resolveContainedPath } from "../src/path-security.js";
import { safeJsonStringify } from "../src/trust.js";
import { validateDevelopmentReport } from "./lib/development-report.js";

const options = parseArgs(process.argv.slice(2));
const selected = containedFile(options.input);
if (selected.stat.size > 16 * 1024 * 1024) {
  throw new Error("Development report exceeds its 16 MiB limit.");
}
const report = JSON.parse(fs.readFileSync(selected.path, "utf8"));
const validation = validateDevelopmentReport(report, {
  candidateCommit: options.candidateCommit,
  candidateVersion: options.candidateVersion,
  requireThresholdPass: options.requireThresholdPass
});
process.stdout.write(`${safeJsonStringify(validation)}\n`);

function parseArgs(argv) {
  const options = {
    input: null,
    candidateCommit: null,
    candidateVersion: null,
    requireThresholdPass: false
  };
  const values = new Map([
    ["--input", "input"],
    ["--candidate-commit", "candidateCommit"],
    ["--candidate-version", "candidateVersion"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (values.has(argument)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      options[values.get(argument)] = value;
    } else if (argument === "--require-threshold-pass") {
      options.requireThresholdPass = true;
    } else {
      throw new Error(`Unknown development-report option: ${argument}`);
    }
  }
  if (
    !options.input ||
    !/^[0-9a-f]{40}$/.test(options.candidateCommit || "") ||
    !options.candidateVersion
  ) {
    throw new Error(
      "--input, full --candidate-commit, and --candidate-version are required."
    );
  }
  return options;
}

function containedFile(value) {
  const resolved = path.resolve(value);
  const parent = fs.realpathSync(path.dirname(resolved));
  const file = resolveContainedPath(parent, path.basename(resolved), {
    type: "file"
  });
  if (!file.ok) {
    throw new Error(`Unsafe development report: ${file.reason}`);
  }
  return file;
}
