#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { atomicWriteContained } from "../src/persistence/safe-fs.js";
import { resolveContainedPath } from "../src/path-security.js";
import {
  canonicalJson,
  sha256,
  validateD2eAnalysis
} from "./lib/d2e-evidence.js";

const MAX_JSON_BYTES = 8 * 1024 * 1024;

try {
  const options = parseArgs(process.argv.slice(2));
  const attemptRoot = canonicalDirectory(options.attempt);
  if (fs.existsSync(path.join(attemptRoot, "analysis.json"))) {
    throw new Error("D.2E analysis conclusion already exists.");
  }
  const analysis = parseJson(
    externalBoundedFile(options.input),
    "analysis input"
  );
  const validation = validateD2eAnalysis(analysis);
  if (!validation.valid) {
    throw new Error(
      `D.2E analysis conclusion is invalid: ${validation.failures.join(", ")}`
    );
  }
  const manifestBytes = boundedFile(
    attemptRoot,
    "trace-manifest.json"
  );
  const equivalenceBytes = boundedFile(
    attemptRoot,
    "equivalence.json"
  );
  const mechanismBytes = boundedFile(
    attemptRoot,
    "mechanism-analysis.json"
  );
  const manifest = parseJson(manifestBytes, "trace manifest");
  const bindings = analysis.bindings;
  if (
    manifest?.complete !== true ||
    bindings.source_commit !== manifest.source_commit ||
    bindings.protocol_sha256 !== manifest.protocol_sha256 ||
    bindings.trace_schema_sha256 !== manifest.trace_schema_sha256 ||
    bindings.analysis_schema_sha256 !==
      manifest.analysis_schema_sha256 ||
    bindings.corpus_sha256 !== manifest.corpus_sha256 ||
    bindings.d2a_report_sha256 !== manifest.d2a_report_sha256 ||
    bindings.cache_identity_sha256 !==
      manifest.cache_identity_sha256 ||
    bindings.artifact_sha256 !== manifest.artifact_sha256 ||
    bindings.conformance_report_sha256 !==
      parseJson(
        boundedFile(attemptRoot, "attempt-binding.json"),
        "attempt binding"
      ).conformance_report_sha256 ||
    bindings.attempt_binding_sha256 !==
      manifest.attempt_binding_sha256 ||
    bindings.raw_report_sha256 !== manifest.raw_report_sha256 ||
    bindings.trace_set_sha256 !== manifest.trace_set_sha256 ||
    bindings.equivalence_sha256 !== sha256(equivalenceBytes) ||
    bindings.mechanism_analysis_sha256 !== sha256(mechanismBytes)
  ) {
    throw new Error("D.2E conclusion bindings do not reconcile.");
  }
  atomicWriteContained(
    attemptRoot,
    "analysis.json",
    `${canonicalJson(analysis)}\n`
  );
  process.stdout.write(
    `${JSON.stringify({
      disposition: analysis.disposition,
      support: analysis.counts.support_candidates,
      controls: analysis.counts.control_candidates,
      counterexamples: analysis.counts.counterexamples
    })}\n`
  );
} catch (error) {
  process.stderr.write(
    `Kanon D.2E conclusion error: ${String(
      error?.message || error
    ).slice(0, 2_000)}\n`
  );
  process.exitCode = 1;
}

function parseArgs(argv) {
  if (
    argv.length !== 4 ||
    argv[0] !== "--attempt" ||
    !argv[1] ||
    argv[2] !== "--input" ||
    !argv[3]
  ) {
    throw new Error(
      "Usage: d2e-conclude.js --attempt <directory> --input <analysis.json>"
    );
  }
  return {
    attempt: path.resolve(argv[1]),
    input: path.resolve(argv[3])
  };
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

function boundedFile(root, relative) {
  const file = resolveContainedPath(root, relative, { type: "file" });
  if (!file.ok || file.stat.size > MAX_JSON_BYTES) {
    throw new Error(`Unsafe or oversized JSON: ${relative}`);
  }
  return fs.readFileSync(file.path);
}

function externalBoundedFile(filePath) {
  const resolved = path.resolve(filePath);
  return boundedFile(
    canonicalDirectory(path.dirname(resolved)),
    path.basename(resolved)
  );
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Invalid ${label} JSON.`);
  }
}
