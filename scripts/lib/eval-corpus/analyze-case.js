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
      scan: {
        complete: state.scan?.complete === true
      }
    }
  })}\n`);
} catch (error) {
  process.stderr.write(
    `${String(error?.stack || error?.message || error).slice(0, 8_000)}\n`
  );
  process.exitCode = 1;
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
