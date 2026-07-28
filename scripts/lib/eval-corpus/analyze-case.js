#!/usr/bin/env node

import { pathToFileURL } from "node:url";

try {
  const input = JSON.parse(await readStdin(64 * 1024));
  const module = await import(pathToFileURL(input.analyzer_module).href);
  if (typeof module.analyzeRepo !== "function") {
    throw new Error("Analyzer module does not export analyzeRepo.");
  }
  const analysis = await module.analyzeRepo(input.repository_root, {
    runId: input.run_id,
    inspectGit: false,
    scan: input.scan
  });
  const state = analysis?.state;
  if (!state || typeof state !== "object") {
    throw new Error("Analyzer returned no state object.");
  }
  process.stdout.write(`${JSON.stringify({
    state: {
      version: state.version,
      important_files: state.important_files,
      commands: {
        run: state.commands?.run || [],
        test: state.commands?.test || []
      },
      scan: boundedScanDiagnostics(state.scan)
    }
  })}\n`);
} catch (error) {
  process.stderr.write(
    `${String(error?.stack || error?.message || error).slice(0, 8_000)}\n`
  );
  process.exitCode = 1;
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
