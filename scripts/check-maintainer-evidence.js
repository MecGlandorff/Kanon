#!/usr/bin/env node

import path from "node:path";
import { canonicalBytes } from
  "../eval/v1.0.0-maintainer/lib/validator.js";
import { atomicWriteContained } from
  "../src/persistence/safe-fs.js";
import { validateMaintainerStableEvidence } from
  "./lib/maintainer-stable-release.js";

const root = process.cwd();
const output = parseOutput(process.argv.slice(2));
const binding = validateMaintainerStableEvidence(root);
atomicWriteContained(root, output, canonicalBytes(binding));
process.stdout.write(
  "Validated and bound frozen maintainer-stable evidence.\n"
);

function parseOutput(argv) {
  if (
    argv.length !== 2 ||
    argv[0] !== "--output" ||
    !argv[1] ||
    path.isAbsolute(argv[1]) ||
    argv[1].includes("\\") ||
    argv[1].split("/").includes("..")
  ) {
    throw new Error("Usage: check-maintainer-evidence.js --output <relative-path>");
  }
  return argv[1];
}
