import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWriteContained } from "../../src/persistence/safe-fs.js";
import { resolveContainedPath } from "../../src/path-security.js";
import {
  safeJsonStringify,
  safeTerminalText
} from "../../src/trust.js";

/**
 * Finalize the evaluator-owned top-level D.2E trace manifest after all case
 * workers have returned their bounded receipts.
 *
 * @param {{
 *   root: string,
 *   caseDirectory: string,
 *   binding: Record<string, unknown>
 * }} attempt
 * @param {Record<string, unknown>} run
 * @param {string} reportPath
 */
export function finalizeTraceAttempt(attempt, run, reportPath) {
  const receipts = run.ranking_trace?.receipts;
  const failures = [];
  const caseFiles = [];
  let totalBytes = 0;
  let totalCandidates = 0;
  if (!Array.isArray(receipts) || receipts.length !== 30) {
    failures.push("trace-receipt-count");
  }
  for (const receipt of Array.isArray(receipts) ? receipts : []) {
    const expectedName =
      `case-${String(receipt.ordinal).padStart(3, "0")}.json`;
    const resolved = resolveContainedPath(
      attempt.caseDirectory,
      expectedName,
      { type: "file" }
    );
    if (
      receipt.status !== "written" ||
      receipt.file_name !== expectedName ||
      !resolved.ok ||
      resolved.stat.size > 128 * 1024 * 1024
    ) {
      failures.push(`trace-case-${String(receipt.ordinal)}`);
      continue;
    }
    const bytes = fs.readFileSync(resolved.path);
    const hash = crypto
      .createHash("sha256")
      .update(bytes)
      .digest("hex");
    let trace;
    try {
      trace = JSON.parse(bytes.toString("utf8"));
    } catch {
      failures.push(`trace-json-${String(receipt.ordinal)}`);
      continue;
    }
    const candidateCount = Number(trace?.limits?.candidate_count);
    totalBytes += bytes.length;
    totalCandidates += Number.isInteger(candidateCount)
      ? candidateCount
      : 0;
    if (
      hash !== receipt.sha256 ||
      bytes.length !== receipt.bytes ||
      receipt.complete !== true ||
      trace?.completeness?.complete !== true
    ) {
      failures.push(`trace-binding-${String(receipt.ordinal)}`);
    }
    caseFiles.push({
      ordinal: receipt.ordinal,
      id: safeTerminalText(receipt.id),
      revision: receipt.revision,
      file: `cases/${expectedName}`,
      sha256: hash,
      bytes: bytes.length,
      candidate_count:
        Number.isInteger(candidateCount) ? candidateCount : null,
      complete:
        receipt.complete === true &&
        trace?.completeness?.complete === true
    });
  }
  if (totalBytes > 1024 * 1024 * 1024) {
    failures.push("trace-total-byte-limit");
  }
  const report = containedSelectedFile(reportPath);
  const attemptBinding = containedSelectedFile(
    path.join(attempt.root, "attempt-binding.json")
  );
  const manifest = {
    schema: "kanon-d2e-trace-manifest-v1",
    attempt: 1,
    retries: 0,
    source_commit: attempt.binding.source_commit,
    protocol_sha256: attempt.binding.protocol_sha256,
    trace_schema_sha256: attempt.binding.trace_schema_sha256,
    analysis_schema_sha256: attempt.binding.analysis_schema_sha256,
    corpus_sha256: attempt.binding.corpus_sha256,
    d2a_report_sha256: attempt.binding.d2a_report_sha256,
    cache_identity_sha256: attempt.binding.cache_identity_sha256,
    artifact_sha256: attempt.binding.artifact_sha256,
    attempt_binding_sha256: sha256Bytes(
      fs.readFileSync(attemptBinding.path)
    ),
    raw_report_sha256: sha256Bytes(fs.readFileSync(report.path)),
    trace_set_sha256: sha256Bytes(
      Buffer.from(
        JSON.stringify(
          caseFiles.map((item) => ({
            ordinal: item.ordinal,
            sha256: item.sha256
          }))
        )
      )
    ),
    case_count: caseFiles.length,
    candidate_count: totalCandidates,
    trace_bytes: totalBytes,
    complete:
      failures.length === 0 &&
      caseFiles.length === 30 &&
      caseFiles.every((item) => item.complete),
    failures: Array.from(new Set(failures)).slice(0, 64),
    case_files: caseFiles
  };
  atomicWriteContained(
    attempt.root,
    "trace-manifest.json",
    `${safeJsonStringify(manifest)}\n`
  );
  return manifest;
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function containedSelectedFile(filePath) {
  const resolved = path.resolve(filePath);
  const parent = canonicalDirectory(path.dirname(resolved));
  const file = resolveContainedPath(parent, path.basename(resolved), {
    type: "file"
  });
  if (!file.ok) {
    throw new Error(`Unsafe selected file: ${file.reason}`);
  }
  return file;
}

function canonicalDirectory(directory) {
  const lexical = fs.lstatSync(path.resolve(directory));
  if (lexical.isSymbolicLink() || !lexical.isDirectory()) {
    throw new Error(`Expected a real directory: ${directory}`);
  }
  const result = resolveContainedPath(directory, ".", {
    allowRoot: true,
    type: "directory"
  });
  if (!result.ok) {
    throw new Error(`Unsafe directory: ${result.reason}`);
  }
  return result.root;
}
