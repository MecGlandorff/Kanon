#!/usr/bin/env node

import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { atomicWriteContained } from "../../../src/persistence/safe-fs.js";
import {
  createRankingTraceCollector,
  validateRankingTrace
} from "../d2e-trace.js";

try {
  const input = JSON.parse(await readStdin(64 * 1024));
  const module = await import(pathToFileURL(input.analyzer_module).href);
  if (typeof module.analyzeRepo !== "function") {
    throw new Error("Analyzer module does not export analyzeRepo.");
  }
  const collector = input.ranking_trace
    ? createRankingTraceCollector(input.ranking_trace.binding)
    : null;
  const analysis = await module.analyzeRepo(input.repository_root, {
    runId: input.run_id,
    inspectGit: false,
    scan: input.scan,
    ...(collector ? { _rankingObserver: collector.observer } : {})
  });
  const state = analysis?.state;
  if (!state || typeof state !== "object") {
    throw new Error("Analyzer returned no state object.");
  }
  const rankingTraceReceipt = collector
    ? preserveRankingTrace(input.ranking_trace, collector, analysis)
    : null;
  process.stdout.write(`${JSON.stringify({
    state: {
      version: state.version,
      important_files: state.important_files,
      commands: {
        run: state.commands?.run || [],
        test: state.commands?.test || []
      },
      scan: boundedScanDiagnostics(state.scan)
    },
    ...(rankingTraceReceipt
      ? { ranking_trace: rankingTraceReceipt }
      : {})
  })}\n`);
} catch (error) {
  process.stderr.write(
    `${String(error?.stack || error?.message || error).slice(0, 8_000)}\n`
  );
  process.exitCode = 1;
}

function preserveRankingTrace(request, collector, analysis) {
  try {
    if (
      !request ||
      typeof request.output_directory !== "string" ||
      !/^case-\d{3}\.json$/.test(String(request.file_name || ""))
    ) {
      throw new Error("Invalid ranking trace output request.");
    }
    const trace = collector.finalize(analysis);
    const validation = validateRankingTrace(
      trace,
      request.binding
    );
    const bytes = `${JSON.stringify(trace)}\n`;
    atomicWriteContained(
      request.output_directory,
      request.file_name,
      bytes
    );
    return {
      status: "written",
      file_name: request.file_name,
      sha256: crypto
        .createHash("sha256")
        .update(bytes)
        .digest("hex"),
      bytes: Buffer.byteLength(bytes),
      complete:
        trace.completeness.complete === true &&
        validation.valid,
      validation_failures: validation.failures
    };
  } catch (error) {
    return {
      status: "failed",
      file_name:
        typeof request?.file_name === "string"
          ? request.file_name.slice(0, 64)
          : null,
      sha256: null,
      bytes: 0,
      complete: false,
      validation_failures: [
        String(error?.message || error || "trace failure").slice(0, 1_000)
      ]
    };
  }
}

function boundedScanDiagnostics(value) {
  const scan = value && typeof value === "object" ? value : {};
  return {
    complete: scan.complete === true,
    strategy: scan.strategy || null,
    max_file_bytes: scan.max_file_bytes || null,
    max_total_text_bytes: scan.max_total_text_bytes || null,
    total_text_bytes_read: scan.total_text_bytes_read || 0,
    truncated: scan.truncated === true,
    unreadable_entries: scan.unreadable_entries || 0,
    symlinks_skipped: scan.symlinks_skipped || 0,
    rejected_paths: scan.rejected_paths || 0,
    outside_root_paths: scan.outside_root_paths || 0,
    budgets_reached: Array.isArray(scan.budgets_reached)
      ? scan.budgets_reached.slice(0, 16)
      : [],
    path_failures: Array.isArray(scan.path_failures)
      ? scan.path_failures.slice(0, 50).map((failure) => ({
          path:
            typeof failure?.path === "string"
              ? failure.path.slice(0, 1_000)
              : null,
          status:
            typeof failure?.status === "string"
              ? failure.status.slice(0, 100)
              : null,
          code:
            typeof failure?.code === "string"
              ? failure.code.slice(0, 100)
              : null,
          reason:
            typeof failure?.reason === "string"
              ? failure.reason.slice(0, 1_000)
              : null
        }))
      : [],
    path_failures_truncated: scan.path_failures_truncated === true
  };
}

async function readStdin(maximumBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > maximumBytes) {
      throw new Error("Analysis request exceeds its input limit.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
