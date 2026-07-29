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
    throw new Error("D.2E failure destination must be absent.");
  }
  if (
    fs.existsSync(path.join(attemptRoot, "trace-manifest.json")) ||
    fs.existsSync(path.join(attemptRoot, "equivalence.json")) ||
    fs.existsSync(path.join(attemptRoot, "mechanism-analysis.json")) ||
    fs.existsSync(path.join(attemptRoot, "analysis.json"))
  ) {
    throw new Error(
      "Failure preservation refuses a completed or analyzed attempt."
    );
  }

  const bindingBytes = boundedFile(
    attemptRoot,
    "attempt-binding.json",
    MAX_SMALL_FILE_BYTES
  );
  const reportBytes = boundedFile(
    attemptRoot,
    "raw-report.json",
    MAX_SMALL_FILE_BYTES
  );
  const binding = parseJson(bindingBytes, "attempt binding");
  const report = parseJson(reportBytes, "raw report");
  const receipts = report?.ranking_trace?.receipts;
  if (
    binding?.schema !== "kanon-d2e-trace-attempt-binding-v1" ||
    binding.attempt !== 1 ||
    binding.retries !== 0 ||
    report?.candidate?.commit !== binding.source_commit ||
    report?.candidate?.worktree_clean !== true ||
    report?.artifact?.sha256 !== binding.artifact_sha256 ||
    report?.corpus?.manifest_sha256 !== binding.corpus_sha256 ||
    !Array.isArray(report.results) ||
    report.results.length !== 30 ||
    !Array.isArray(receipts) ||
    receipts.length !== 30
  ) {
    throw new Error("Failed D.2E attempt bindings do not reconcile.");
  }

  const cases = [];
  let traceBytes = 0;
  let candidateCount = 0;
  for (const [index, receipt] of receipts.entries()) {
    const ordinal = index + 1;
    const fileName =
      `case-${String(ordinal).padStart(3, "0")}.json`;
    const relative = `cases/${fileName}`;
    if (
      receipt.ordinal !== ordinal ||
      receipt.status !== "written" ||
      receipt.file_name !== fileName ||
      receipt.complete !== true
    ) {
      throw new Error(
        `Failed D.2E trace receipt ${ordinal} is incomplete.`
      );
    }
    const bytes = boundedFile(
      attemptRoot,
      relative,
      MAX_CASE_FILE_BYTES
    );
    const trace = parseJson(bytes, `trace case ${ordinal}`);
    const hash = sha256(bytes);
    const candidates = Number(trace?.limits?.candidate_count);
    if (
      hash !== receipt.sha256 ||
      bytes.length !== receipt.bytes ||
      trace?.completeness?.complete !== true ||
      trace?.case?.ordinal !== ordinal ||
      trace?.case?.id !== receipt.id ||
      trace?.case?.revision !== receipt.revision ||
      trace?.trace_source_commit !== binding.source_commit ||
      trace?.artifact_sha256 !== binding.artifact_sha256 ||
      trace?.corpus_sha256 !== binding.corpus_sha256 ||
      trace?.protocol_sha256 !== binding.protocol_sha256 ||
      !Number.isInteger(candidates)
    ) {
      throw new Error(
        `Failed D.2E trace case ${ordinal} does not reconcile.`
      );
    }
    traceBytes += bytes.length;
    candidateCount += candidates;
    cases.push({
      ordinal,
      id: receipt.id,
      revision: receipt.revision,
      file: relative,
      sha256: hash,
      bytes: bytes.length,
      candidate_count: candidates,
      trace_complete: true
    });
  }
  if (traceBytes > MAX_TOTAL_TRACE_BYTES) {
    throw new Error("Failed D.2E trace exceeds its total byte limit.");
  }
  const traceSetSha256 = sha256(
    Buffer.from(
      JSON.stringify(
        cases.map((item) => ({
          ordinal: item.ordinal,
          sha256: item.sha256
        }))
      )
    )
  );
  const failureManifest = {
    schema: "kanon-d2e-failed-attempt-v1",
    attempt: 1,
    retries: 0,
    exit_status: 2,
    failure_boundary:
      "after-30-predictions-before-trace-manifest",
    failure:
      "trace-manifest-finalization: safeTerminalText is not defined",
    corpus_attempt_started: true,
    predictions_written: report.results.length,
    trace_files_written: cases.length,
    per_case_trace_complete: cases.every(
      (item) => item.trace_complete
    ),
    equivalence_gate_completed: false,
    trace_completeness_gate_completed: false,
    hypothesis_analysis_performed: false,
    hypothesis_disposition: "unavailable",
    correction_implemented: false,
    source_commit: binding.source_commit,
    package_version: binding.package_version,
    branch: binding.branch,
    upstream: binding.upstream,
    ahead: binding.ahead,
    behind: binding.behind,
    protocol_sha256: binding.protocol_sha256,
    trace_schema_sha256: binding.trace_schema_sha256,
    analysis_schema_sha256: binding.analysis_schema_sha256,
    corpus_sha256: binding.corpus_sha256,
    d2a_report_sha256: binding.d2a_report_sha256,
    cache_identity_sha256: binding.cache_identity_sha256,
    artifact_sha256: binding.artifact_sha256,
    conformance_report_sha256:
      binding.conformance_report_sha256,
    attempt_binding_sha256: sha256(bindingBytes),
    raw_report_sha256: sha256(reportBytes),
    trace_set_sha256: traceSetSha256,
    case_count: cases.length,
    candidate_count: candidateCount,
    trace_bytes: traceBytes,
    case_files: cases
  };

  ensureContainedDirectory(repoRoot, destinationRelative);
  ensureContainedDirectory(
    repoRoot,
    `${destinationRelative}/cases`
  );
  for (const relative of [
    "attempt-binding.json",
    "raw-report.json"
  ]) {
    atomicWriteContained(
      repoRoot,
      `${destinationRelative}/${relative}`,
      boundedFile(attemptRoot, relative, MAX_SMALL_FILE_BYTES)
    );
  }
  for (const item of cases) {
    atomicWriteContained(
      repoRoot,
      `${destinationRelative}/${item.file}`,
      boundedFile(
        attemptRoot,
        item.file,
        MAX_CASE_FILE_BYTES
      )
    );
  }
  atomicWriteContained(
    repoRoot,
    `${destinationRelative}/failure-manifest.json`,
    `${safeJsonStringify(failureManifest)}\n`
  );
  process.stdout.write(
    `${JSON.stringify({
      destination: destinationRelative,
      cases: cases.length,
      candidates: candidateCount,
      trace_bytes: traceBytes,
      trace_set_sha256: traceSetSha256,
      hypothesis_analysis_performed: false
    })}\n`
  );
} catch (error) {
  process.stderr.write(
    `Kanon D.2E failure preservation error: ${String(
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
    argv[2] !== "--destination" ||
    !argv[3]
  ) {
    throw new Error(
      "Usage: d2e-preserve-failure.js --attempt <directory> --destination <eval/results/d2e-trace-failed-id>"
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
    !/^eval\/results\/d2e-trace-failed-[0-9a-f]{8,64}$/.test(
      normalized
    )
  ) {
    throw new Error("Invalid D.2E failure destination.");
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

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
