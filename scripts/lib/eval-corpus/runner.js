import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VERSION } from "../../../src/version.js";
import { runGit } from "../../../src/git-runner.js";
import { ensureCheckout } from "./checkout.js";
import {
  aggregateScores,
  scoreCase,
  scoreErrorCase
} from "./scoring.js";

export async function runCorpus(corpus, options = {}) {
  const cacheRoot = path.resolve(
    options.cacheRoot ||
      process.env.KANON_CORPUS_CACHE ||
      path.join(
        os.tmpdir(),
        `kanon-corpus-v${corpus.schema_version}`
      )
  );
  if (
    corpus.evaluation_role === "release" &&
    options.repoIds?.length
  ) {
    throw new Error("Release evaluation rejects --repo subsets.");
  }
  const selected = options.repoIds?.length
    ? corpus.cases.filter((item) =>
        options.repoIds.includes(item.id)
      )
    : corpus.cases;
  if (selected.length === 0) {
    throw new Error(
      "No corpus cases matched the requested --repo value."
    );
  }
  if (
    options.repoIds?.length &&
    selected.length !== new Set(options.repoIds).size
  ) {
    throw new Error("At least one requested --repo id was not found.");
  }
  if (
    corpus.evaluation_role === "release" &&
    selected.length !== corpus.cases.length
  ) {
    throw new Error(
      "Release evaluation must select every frozen corpus case."
    );
  }

  const analyzerModule = path.resolve(
    options.analyzerModule ||
      fileURLToPath(new URL("../../../src/index.js", import.meta.url))
  );
  const analysisTimeoutMs = boundedTimeout(
    options.analysisTimeoutMs,
    35_000
  );
  const results = [];
  const rankingTraceReceipts = [];
  let analyzerVersion = options.analyzerVersion || VERSION;
  for (const [caseIndex, item] of selected.entries()) {
    try {
      options.onProgress?.({ phase: "checkout", id: item.id });
      const checkout = ensureCheckout(item, {
        cacheRoot,
        fetch: options.fetch !== false,
        gitTimeoutMs: options.gitTimeoutMs,
        gitMaxOutputBytes: options.gitMaxOutputBytes
      });
      options.onProgress?.({ phase: "analyze", id: item.id });
      const analysisStarted = Date.now();
      const analysis = analyzeCase(
        analyzerModule,
        checkout,
        item,
        analysisTimeoutMs,
        options.rankingTrace
          ? {
              output_directory:
                options.rankingTrace.outputDirectory,
              file_name:
                `case-${String(caseIndex + 1).padStart(3, "0")}.json`,
              binding: {
                protocolSha256:
                  options.rankingTrace.protocolSha256,
                traceSourceCommit:
                  options.rankingTrace.traceSourceCommit,
                artifactSha256:
                  options.rankingTrace.artifactSha256,
                corpusSha256:
                  options.rankingTrace.corpusSha256,
                caseId: item.id,
                revision: item.revision,
                ordinal: caseIndex + 1
              }
            }
          : null
      );
      const analysisDurationMs = Date.now() - analysisStarted;
      analyzerVersion = analysis.state.version || analyzerVersion;
      if (options.rankingTrace) {
        rankingTraceReceipts.push({
          id: item.id,
          revision: item.revision,
          ordinal: caseIndex + 1,
          ...(analysis.ranking_trace || {
            status: "missing",
            file_name: null,
            sha256: null,
            bytes: 0,
            complete: false,
            validation_failures: ["worker trace receipt missing"]
          })
        });
      }
      results.push({
        ...scoreCase(item, analysis, corpus.policy),
        analysis_duration_ms: analysisDurationMs
      });
    } catch (error) {
      options.onProgress?.({
        phase: "error",
        id: item.id,
        message: error.message
      });
      if (options.rankingTrace) {
        rankingTraceReceipts.push({
          id: item.id,
          revision: item.revision,
          ordinal: caseIndex + 1,
          status: "analysis-error",
          file_name:
            `case-${String(caseIndex + 1).padStart(3, "0")}.json`,
          sha256: null,
          bytes: 0,
          complete: false,
          validation_failures: [
            String(error?.message || error).slice(0, 1_000)
          ]
        });
      }
      results.push(scoreErrorCase(item, error, corpus.policy));
    }
  }

  const summary = aggregateScores(results, corpus.policy, {
    expectedCaseCount:
      corpus.evaluation_role === "release"
        ? corpus.cases.length
        : selected.length,
    requireCompleteScans: corpus.evaluation_role === "release"
  });
  const artifactConformance = options.artifactConformance || {
    applicable: corpus.evaluation_role === "release",
    passed: corpus.evaluation_role === "release" ? false : null,
    reasons: corpus.evaluation_role === "release"
      ? ["Release artifact conformance was not supplied."]
      : ["Source-tree development evaluation."]
  };
  if (
    corpus.evaluation_role === "release" &&
    !artifactConformance.passed
  ) {
    summary.passed = false;
    summary.failures.push(
      ...artifactConformance.reasons.map(
        (reason) => `artifact conformance: ${reason}`
      )
    );
  }

  return {
    generated_at: new Date().toISOString(),
    candidate: corpus.release
      ? {
          commit: corpus.release.candidate_commit,
          version: corpus.release.candidate_version,
          worktree_clean: true
        }
      : observeDevelopmentCandidate(analyzerVersion),
    analyzer: {
      version: analyzerVersion,
      source: options.analyzerSource || "source-tree"
    },
    environment: {
      node: process.version,
      os: process.platform,
      os_release: os.release(),
      architecture: process.arch,
      endianness: os.endianness(),
      child_timezone: "UTC",
      child_locale: "C",
      child_max_old_space_mb: 512
    },
    limits: {
      analysis_timeout_ms: analysisTimeoutMs,
      git_timeout_ms: options.gitTimeoutMs ?? 60_000,
      git_output_bytes:
        options.gitMaxOutputBytes ?? 8 * 1024 * 1024
    },
    corpus: {
      schema_version: corpus.schema_version,
      evaluation_role: corpus.evaluation_role,
      label_version: corpus.label_version,
      manifest_sha256: corpus._manifest?.sha256 || null,
      release: corpus.release || null,
      selected_cases: selected.map((item) => item.id),
      selected_case_count: selected.length,
      total_case_count: corpus.cases.length
    },
    artifact: {
      sha256: options.artifactSha256 || null,
      conformance: artifactConformance
    },
    cache_root: cacheRoot,
    results,
    summary,
    final: {
      passed: summary.passed,
      reasons: summary.passed
        ? ["All predeclared gates passed."]
        : summary.failures
    },
    ...(options.rankingTrace
      ? {
          ranking_trace: {
            schema: "kanon-d2e-ranking-trace-receipts-v1",
            receipts: rankingTraceReceipts
          }
        }
      : {})
  };
}

function observeDevelopmentCandidate(version) {
  const sourceRoot = fileURLToPath(
    new URL("../../../", import.meta.url)
  );
  const head = runGit(sourceRoot, ["rev-parse", "HEAD"], {
    timeoutMs: 5_000,
    maxOutputBytes: 64 * 1024
  });
  const status = runGit(
    sourceRoot,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    {
      timeoutMs: 5_000,
      maxOutputBytes: 4 * 1024 * 1024
    }
  );
  return {
    commit:
      head.ok && /^[0-9a-f]{40}$/.test(head.stdout.trim())
        ? head.stdout.trim()
        : null,
    version,
    worktree_clean: status.ok ? status.stdout.trim() === "" : null
  };
}

export function analyzeCase(
  analyzerModule,
  repositoryRoot,
  item,
  timeoutMs,
  rankingTrace = null
) {
  const worker = fileURLToPath(
    new URL("./analyze-case.js", import.meta.url)
  );
  const result = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=512",
      worker
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        LANG: "C",
        LC_ALL: "C",
        NO_COLOR: "1",
        TEMP: os.tmpdir(),
        TMP: os.tmpdir(),
        TMPDIR: os.tmpdir(),
        TZ: "UTC"
      },
      input: JSON.stringify({
        analyzer_module: analyzerModule,
        repository_root: repositoryRoot,
        run_id: `eval-${item.revision.slice(0, 12)}`,
        scan: {
          maxFiles: 25_000,
          maxEntries: 100_000,
          maxFileBytes: 1_000_000,
          maxTotalHashBytes: 128 * 1024 * 1024,
          maxTotalTextBytes: 32 * 1024 * 1024,
          maxElapsedMs: 30_000,
          useGitIgnore: false
        },
        ...(rankingTrace
          ? { ranking_trace: rankingTrace }
          : {})
      }),
      maxBuffer: 4 * 1024 * 1024,
      timeout: timeoutMs,
      windowsHide: true
    }
  );
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(
      `Analysis timed out after ${timeoutMs} ms.`
    );
  }
  if (result.error?.code === "ENOBUFS") {
    throw new Error(
      "Analysis exceeded its 4 MiB result limit."
    );
  }
  if (result.error) {
    throw new Error(`Analysis process failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Analysis process exited ${String(result.status)}${
        result.signal ? ` (${result.signal})` : ""
      }: ${String(result.stderr || "").trim().slice(0, 2_000)}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error("Analysis process returned invalid bounded JSON.");
  }
  return parsed;
}

function boundedTimeout(value, fallback) {
  return Number.isInteger(value) && value >= 1_000 && value <= 120_000
    ? value
    : fallback;
}
