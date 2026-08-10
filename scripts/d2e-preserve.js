#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  atomicWriteContained,
  ensureContainedDirectory
} from "../src/persistence/safe-fs.js";
import { resolveContainedPath } from "../src/path-security.js";
import { safeJsonStringify } from "../src/trust.js";
import { validateD2eAnalysis } from "./lib/d2e-evidence.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const MAX_SMALL_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CASE_FILE_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_TRACE_BYTES = 1024 * 1024 * 1024;

try {
  const options = parseArgs(process.argv.slice(2));
  const attemptRoot = canonicalDirectory(options.attempt);
  const destinationRelative = normalizeDestination(options.destination);
  const destinationPath = path.join(repoRoot, destinationRelative);
  if (fs.existsSync(destinationPath)) {
    throw new Error("D.2E evidence destination must be absent.");
  }

  const manifestBytes = boundedFile(
    attemptRoot,
    "trace-manifest.json",
    MAX_SMALL_FILE_BYTES
  );
  const manifest = parseJson(manifestBytes, "trace manifest");
  if (
    manifest?.schema !== "kanon-d2e-trace-manifest-v1" ||
    manifest.complete !== true ||
    manifest.attempt !== 1 ||
    manifest.retries !== 0 ||
    manifest.case_count !== 30 ||
    !Array.isArray(manifest.case_files) ||
    manifest.case_files.length !== 30 ||
    manifest.trace_bytes > MAX_TOTAL_TRACE_BYTES
  ) {
    throw new Error("D.2E trace manifest is not preservable.");
  }

  const smallFiles = [
    "attempt-binding.json",
    "raw-report.json",
    "trace-manifest.json",
    "equivalence.json",
    "mechanism-analysis.json",
    "analysis.json"
  ];
  const evidence = [];
  const buffered = new Map();
  for (const relative of smallFiles) {
    const bytes = boundedFile(
      attemptRoot,
      relative,
      MAX_SMALL_FILE_BYTES
    );
    buffered.set(relative, bytes);
    evidence.push(evidenceRecord(relative, bytes));
  }
  const attemptBinding = parseJson(
    buffered.get("attempt-binding.json"),
    "attempt binding"
  );
  const equivalence = parseJson(
    buffered.get("equivalence.json"),
    "equivalence"
  );
  const mechanismAnalysis = parseJson(
    buffered.get("mechanism-analysis.json"),
    "mechanism analysis"
  );
  const analysis = parseJson(
    buffered.get("analysis.json"),
    "analysis"
  );
  validateBindings({
    attemptBinding,
    manifest,
    equivalence,
    mechanismAnalysis,
    analysis,
    buffered
  });

  let traceBytes = 0;
  for (const [index, item] of manifest.case_files.entries()) {
    const relative =
      `cases/case-${String(index + 1).padStart(3, "0")}.json`;
    if (
      item.file !== relative ||
      item.ordinal !== index + 1 ||
      item.complete !== true
    ) {
      throw new Error(
        `Trace manifest case ${index + 1} is not canonical.`
      );
    }
    const bytes = boundedFile(
      attemptRoot,
      relative,
      MAX_CASE_FILE_BYTES
    );
    if (
      bytes.length !== item.bytes ||
      sha256(bytes) !== item.sha256
    ) {
      throw new Error(
        `Trace case ${index + 1} does not match its manifest.`
      );
    }
    traceBytes += bytes.length;
    evidence.push(evidenceRecord(relative, bytes));
  }
  if (traceBytes !== manifest.trace_bytes) {
    throw new Error("Trace byte total does not reconcile.");
  }

  ensureContainedDirectory(repoRoot, destinationRelative);
  ensureContainedDirectory(
    repoRoot,
    `${destinationRelative}/cases`
  );
  for (const relative of smallFiles) {
    atomicWriteContained(
      repoRoot,
      `${destinationRelative}/${relative}`,
      buffered.get(relative)
    );
  }
  for (const [index] of manifest.case_files.entries()) {
    const relative =
      `cases/case-${String(index + 1).padStart(3, "0")}.json`;
    atomicWriteContained(
      repoRoot,
      `${destinationRelative}/${relative}`,
      boundedFile(
        attemptRoot,
        relative,
        MAX_CASE_FILE_BYTES
      )
    );
  }
  const evidenceManifest = {
    schema: "kanon-d2e-preserved-evidence-v1",
    attempt: 1,
    retries: 0,
    source_commit: manifest.source_commit,
    protocol_sha256: manifest.protocol_sha256,
    trace_schema_sha256: manifest.trace_schema_sha256,
    analysis_schema_sha256: manifest.analysis_schema_sha256,
    corpus_sha256: manifest.corpus_sha256,
    d2a_report_sha256: manifest.d2a_report_sha256,
    cache_identity_sha256: manifest.cache_identity_sha256,
    artifact_sha256: manifest.artifact_sha256,
    trace_set_sha256: manifest.trace_set_sha256,
    case_count: manifest.case_count,
    candidate_count: manifest.candidate_count,
    trace_bytes: manifest.trace_bytes,
    files: evidence.sort((left, right) =>
      left.path.localeCompare(right.path)
    )
  };
  atomicWriteContained(
    repoRoot,
    `${destinationRelative}/evidence-manifest.json`,
    `${safeJsonStringify(evidenceManifest)}\n`
  );
  process.stdout.write(
    `${JSON.stringify({
      destination: destinationRelative,
      cases: manifest.case_count,
      candidates: manifest.candidate_count,
      trace_set_sha256: manifest.trace_set_sha256
    })}\n`
  );
} catch (error) {
  process.stderr.write(
    `Kanon D.2E preservation error: ${String(
      error?.message || error
    ).slice(0, 2_000)}\n`
  );
  process.exitCode = 1;
}

function validateBindings(input) {
  const bindingBytes = input.buffered.get("attempt-binding.json");
  const reportBytes = input.buffered.get("raw-report.json");
  const equivalenceBytes = input.buffered.get("equivalence.json");
  const mechanismBytes = input.buffered.get("mechanism-analysis.json");
  const bindings = input.analysis?.bindings;
  const analysisValidation = validateD2eAnalysis(input.analysis);
  if (
    input.attemptBinding?.schema !==
      "kanon-d2e-trace-attempt-binding-v1" ||
    input.equivalence?.schema !== "kanon-d2e-equivalence-v1" ||
    input.mechanismAnalysis?.schema !==
      "kanon-d2e-mechanism-analysis-v1" ||
    input.analysis?.schema_version !== "kanon-d2e-analysis-v1" ||
    input.analysis?.correction_implemented !== false ||
    !analysisValidation.valid ||
    ![
      "supported-generic-hypothesis",
      "no-supported-generic-hypothesis"
    ].includes(input.analysis?.disposition) ||
    input.manifest.attempt_binding_sha256 !==
      sha256(bindingBytes) ||
    input.manifest.raw_report_sha256 !== sha256(reportBytes) ||
    bindings?.source_commit !== input.manifest.source_commit ||
    bindings?.protocol_sha256 !== input.manifest.protocol_sha256 ||
    bindings?.trace_schema_sha256 !==
      input.manifest.trace_schema_sha256 ||
    bindings?.analysis_schema_sha256 !==
      input.manifest.analysis_schema_sha256 ||
    bindings?.corpus_sha256 !== input.manifest.corpus_sha256 ||
    bindings?.d2a_report_sha256 !== input.manifest.d2a_report_sha256 ||
    bindings?.cache_identity_sha256 !==
      input.manifest.cache_identity_sha256 ||
    bindings?.artifact_sha256 !== input.manifest.artifact_sha256 ||
    bindings?.conformance_report_sha256 !==
      input.attemptBinding.conformance_report_sha256 ||
    bindings?.attempt_binding_sha256 !==
      input.manifest.attempt_binding_sha256 ||
    bindings?.raw_report_sha256 !==
      input.manifest.raw_report_sha256 ||
    bindings?.trace_set_sha256 !== input.manifest.trace_set_sha256 ||
    bindings?.equivalence_sha256 !== sha256(equivalenceBytes) ||
    bindings?.mechanism_analysis_sha256 !== sha256(mechanismBytes)
  ) {
    throw new Error("D.2E analysis bindings do not reconcile.");
  }
}

function parseArgs(argv) {
  if (
    argv.length !== 4 ||
    argv[0] !== "--attempt" ||
    !argv[1] ||
    argv[2] !== "--destination" ||
    !argv[3]
  ) {
    throw new Error(
      "Usage: d2e-preserve.js --attempt <directory> --destination <eval/results/d2e-trace-id>"
    );
  }
  return {
    attempt: path.resolve(argv[1]),
    destination: argv[3]
  };
}

function normalizeDestination(value) {
  const normalized = String(value).replaceAll("\\", "/");
  if (
    !/^eval\/results\/d2e-trace-[0-9a-f]{8,64}$/.test(normalized)
  ) {
    throw new Error("Invalid D.2E evidence destination.");
  }
  return normalized;
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

function boundedFile(root, relative, maximumBytes) {
  const file = resolveContainedPath(root, relative, { type: "file" });
  if (!file.ok || file.stat.size > maximumBytes) {
    throw new Error(`Unsafe or oversized evidence file: ${relative}`);
  }
  return fs.readFileSync(file.path);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Invalid ${label} JSON.`);
  }
}

function evidenceRecord(relative, bytes) {
  return {
    path: relative,
    sha256: sha256(bytes),
    bytes: bytes.length
  };
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
