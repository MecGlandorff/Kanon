#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeTraceAttempt,
  canonicalJson
} from "./lib/d2e-evidence.js";
import { atomicWriteContained } from "../src/persistence/safe-fs.js";
import { resolveContainedPath } from "../src/path-security.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

try {
  const options = parseArgs(process.argv.slice(2));
  const result = analyzeTraceAttempt({
    attemptRoot: options.attempt,
    baselinePath: path.join(
      repoRoot,
      "eval",
      "results",
      "development-0.4.0-rc.1-d2a-74208b9a.json"
    ),
    corpusPath: path.join(repoRoot, "eval", "corpus.json"),
    comparativePath: path.join(
      repoRoot,
      "eval",
      "results",
      "d2c-comparative-unblind-f8b1e7a6",
      "unblinded-analysis.json"
    ),
    protocolPath: path.join(repoRoot, "eval", "d2e", "PROTOCOL.md"),
    traceSchemaPath: path.join(
      repoRoot,
      "eval",
      "d2e",
      "trace.schema.json"
    ),
    analysisSchemaPath: path.join(
      repoRoot,
      "eval",
      "d2e",
      "analysis.schema.json"
    )
  });
  const attemptRoot = canonicalDirectory(options.attempt);
  refuseExisting(attemptRoot, "equivalence.json");
  refuseExisting(attemptRoot, "mechanism-analysis.json");
  atomicWriteContained(
    attemptRoot,
    "equivalence.json",
    `${canonicalJson(result.equivalence)}\n`
  );
  atomicWriteContained(
    attemptRoot,
    "mechanism-analysis.json",
    `${canonicalJson(result.mechanismAnalysis)}\n`
  );
  process.stdout.write(
    `${JSON.stringify({
      semantic_equivalence:
        result.equivalence.semantic_equivalence.passed,
      trace_completeness:
        result.equivalence.trace_completeness.passed,
      cases: result.equivalence.trace_completeness.case_count,
      candidates:
        result.equivalence.trace_completeness.candidate_count,
      structurally_qualifying_mechanisms:
        result.mechanismAnalysis.structurally_qualifying_mechanisms
    })}\n`
  );
} catch (error) {
  process.stderr.write(
    `Kanon D.2E analysis error: ${String(
      error?.message || error
    ).slice(0, 2_000)}\n`
  );
  process.exitCode = 1;
}

function parseArgs(argv) {
  if (
    argv.length !== 2 ||
    argv[0] !== "--attempt" ||
    !argv[1]
  ) {
    throw new Error("Usage: d2e-trace.js --attempt <directory>");
  }
  return { attempt: path.resolve(argv[1]) };
}

function canonicalDirectory(directory) {
  const result = resolveContainedPath(directory, ".", {
    allowRoot: true,
    type: "directory"
  });
  if (!result.ok) {
    throw new Error(`Unsafe attempt directory: ${result.reason}`);
  }
  return result.root;
}

function refuseExisting(root, relative) {
  if (fs.existsSync(path.join(root, relative))) {
    throw new Error(`Refusing existing D.2E output: ${relative}`);
  }
}
