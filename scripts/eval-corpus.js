#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  atomicWriteContained
} from "../src/persistence/safe-fs.js";
import { runGit } from "../src/git-runner.js";
import { resolveContainedPath } from "../src/path-security.js";
import { safeJsonStringify } from "../src/trust.js";
import {
  assertFrozenReleaseCandidate,
  assertNoCorpusOverlap,
  assertReleasePolicyMatches,
  loadCorpus,
  renderCorpusReport,
  runCorpus
} from "./lib/eval-corpus.js";
import {
  repositoryCacheName
} from "./lib/eval-corpus/checkout.js";
import { finalizeTraceAttempt } from "./lib/d2e-finalize.js";
import {
  finalizePostCorrectionTraceAttempt,
  loadPostCorrectionAuthority,
  POST_CORRECTION_AUTHORITY_SHA256,
  preservePostCorrectionAttempt,
  preservePostCorrectionFailure,
  writeAttemptConsumption,
  writePostCorrectionJsonFile
} from "./lib/d2e-post-correction.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
let activePostCorrectionAttempt = null;
let postCorrectionFinalized = false;

try {
  const options = parseArgs(process.argv.slice(2));
  const corpus = loadCorpus(
    options.corpus || path.join(repoRoot, "eval", "corpus.json")
  );
  if (
    options.requireRole &&
    corpus.evaluation_role !== options.requireRole
  ) {
    throw new Error(
      `Expected a ${options.requireRole} corpus, received ${corpus.evaluation_role}.`
    );
  }

  let artifactOptions = {};
  if (corpus.evaluation_role === "release") {
    validateReleaseInvocation(options, corpus);
    const developmentCorpus = loadCorpus(
      path.join(repoRoot, "eval", "corpus.json")
    );
    assertNoCorpusOverlap(corpus, developmentCorpus);
    assertReleasePolicyMatches(corpus, developmentCorpus);
    assertFrozenReleaseCandidate(repoRoot, corpus);
    artifactOptions = await loadBoundArtifact(options, {
      commit: corpus.release.candidate_commit,
      version: corpus.release.candidate_version
    });
  } else if (hasArtifactOption(options)) {
    validateDevelopmentArtifactInvocation(options);
    artifactOptions = await loadBoundArtifact(
      options,
      observeDevelopmentIdentity(repoRoot)
    );
  }
  const traceAttempt = options.rankingTraceDirectory
    ? prepareTraceAttempt(options, corpus, artifactOptions)
    : null;

  let traceOffRun = null;
  const run = await runCorpus(corpus, {
    cacheRoot: options.cache,
    fetch: options.fetch,
    repoIds: options.repos,
    onProgress: options.json
      ? null
      : ({ phase, id, message }) => {
          if (phase === "error") {
            process.stderr.write(`Failed ${id}: ${message}\n`);
          } else {
            process.stderr.write(
              `${phase === "checkout" ? "Preparing" : "Analyzing"} ${id}\n`
            );
          }
        },
    ...artifactOptions,
    ...(traceAttempt
      ? {
          rankingTrace: {
            outputDirectory: traceAttempt.caseDirectory,
            protocolSha256: options.traceProtocolSha256,
            traceSourceCommit: options.traceSourceCommit,
            artifactSha256: artifactOptions.artifactSha256,
            corpusSha256: corpus._manifest.sha256,
            ...(traceAttempt.postCorrection
              ? {
                  canonicalSerialization: true,
                  exclusiveCreation: true,
                  fileNamePrefix: ""
                }
              : {})
          }
        }
      : {}),
    ...(traceAttempt?.postCorrection
      ? {
          onAttemptConsume({ component }) {
            writeAttemptConsumption({
              attemptRoot: traceAttempt.root,
              component,
              preAttemptHead: traceAttempt.binding.source_commit
            });
          },
          onTraceOffComplete(value) {
            traceOffRun = value;
          },
          traceOffControl: true
        }
      : {})
  });
  if (
    corpus.evaluation_role === "release" &&
    run.analyzer.version !== corpus.release.candidate_version
  ) {
    run.summary.passed = false;
    run.summary.failures.push(
      `analyzer version ${run.analyzer.version} does not match candidate ${corpus.release.candidate_version}`
    );
    run.final = {
      passed: false,
      reasons: run.summary.failures
    };
  }

  if (options.json) {
    process.stdout.write(`${safeJsonStringify(run)}\n`);
  } else {
    process.stdout.write(renderCorpusReport(run));
  }
  if (options.jsonOutput) {
    writeJsonOutput(
      options.jsonOutput,
      run,
      traceAttempt?.postCorrection === true
    );
  }
  let traceResult = null;
  if (traceAttempt?.postCorrection) {
    if (!traceOffRun) {
      throw new Error("Post-correction trace-off control is unavailable.");
    }
    const traceOffPath = path.join(
      traceAttempt.root,
      "trace-off-report.json"
    );
    writeJsonOutput(traceOffPath, traceOffRun, true);
    traceResult = finalizePostCorrectionTraceAttempt({
      attempt: traceAttempt,
      corpus,
      primaryRun: run,
      traceOffRun
    });
    if (!traceResult.complete) {
      const preserved = preservePostCorrectionFailure({
        repoRoot,
        attemptRoot: traceAttempt.root,
        error: traceResult.failures.join(", ")
      });
      postCorrectionFinalized = true;
      process.stderr.write(
        `Post-correction attempt preserved at ${preserved.destination_relative}\n`
      );
      process.exitCode = 2;
    } else {
      const preserved = preservePostCorrectionAttempt(
        repoRoot,
        traceAttempt.root
      );
      postCorrectionFinalized = true;
      process.stdout.write(
        `${JSON.stringify({
          post_correction_attempt: preserved.destination_relative,
          complete_tree_sha256: preserved.complete_tree_sha256,
          trace_set_sha256: traceResult.trace_set_sha256
        })}\n`
      );
      process.exitCode = 0;
    }
  } else {
    traceResult = traceAttempt
      ? finalizeTraceAttempt(traceAttempt, run, options.jsonOutput)
      : null;
    process.exitCode = traceResult && !traceResult.complete
      ? 2
      : run.summary.passed
        ? 0
        : 1;
  }
} catch (error) {
  if (
    activePostCorrectionAttempt &&
    !postCorrectionFinalized &&
    fs.existsSync(
      path.join(
        activePostCorrectionAttempt.root,
        "attempt-consumption.json"
      )
    )
  ) {
    try {
      const preserved = preservePostCorrectionFailure({
        repoRoot,
        attemptRoot: activePostCorrectionAttempt.root,
        error: error?.message || error
      });
      postCorrectionFinalized = true;
      process.stderr.write(
        `Post-correction failed attempt preserved at ${preserved.destination_relative}\n`
      );
    } catch (preservationError) {
      process.stderr.write(
        `Post-correction failure preservation error: ${String(
          preservationError?.message || preservationError
        ).slice(0, 2_000)}\n`
      );
    }
  }
  process.stderr.write(`Kanon corpus error: ${error.message}\n`);
  process.exitCode = 2;
}

function validateReleaseInvocation(options, corpus) {
  if (options.repos.length) {
    throw new Error("Release evaluation rejects --repo.");
  }
  if (!options.expectedCorpusSha256) {
    throw new Error(
      "Release evaluation requires --expected-corpus-sha256."
    );
  }
  if (
    options.expectedCorpusSha256 !== corpus._manifest.sha256
  ) {
    throw new Error(
      "Release corpus SHA-256 does not match the expected frozen hash."
    );
  }
  for (const [field, flag] of [
    [options.artifactTarball, "--artifact-tarball"],
    [options.artifactRoot, "--artifact-root"],
    [options.conformanceReport, "--conformance-report"]
  ]) {
    if (!field) {
      throw new Error(`Release evaluation requires ${flag}.`);
    }
  }
}

async function loadBoundArtifact(options, candidate) {
  const artifactSha256 = sha256BoundedFile(
    options.artifactTarball,
    128 * 1024 * 1024
  );
  const conformance = readBoundedJson(
    options.conformanceReport,
    2 * 1024 * 1024
  );
  if (conformance.schema !== "kanon-artifact-conformance-v1") {
    throw new Error("Unsupported artifact conformance report schema.");
  }
  if (conformance.artifact_sha256 !== artifactSha256) {
    throw new Error(
      "Conformance report artifact hash does not match the tarball."
    );
  }
  if (
    conformance.candidate_commit !== candidate.commit ||
    conformance.candidate_version !== candidate.version
  ) {
    throw new Error(
      "Conformance report candidate identity does not match the selected candidate."
    );
  }
  if (conformance.passed !== true) {
    throw new Error("Artifact conformance did not pass.");
  }

  const artifactRoot = canonicalDirectory(options.artifactRoot);
  if (
    typeof conformance.installed_package_root !== "string" ||
    canonicalDirectory(conformance.installed_package_root) !== artifactRoot
  ) {
    throw new Error(
      "Conformance report installed root does not match --artifact-root."
    );
  }
  const analyzer = resolveContainedPath(
    artifactRoot,
    "runtime/src/v1/compatibility/refresh.js",
    { type: "file" }
  );
  if (!analyzer.ok) {
    throw new Error(
      `Installed artifact analyzer is unavailable: ${analyzer.reason}`
    );
  }
  const module = await import(
    `${pathToFileURL(analyzer.path).href}?sha256=${artifactSha256}`
  );
  if (typeof module.analyzeRepo !== "function") {
    throw new Error("Installed artifact does not export analyzeRepo.");
  }
  return {
    analyzerModule: analyzer.path,
    analyzerSource: "installed-artifact",
    analyzerVersion: candidate.version,
    artifactSha256,
    artifactConformance: {
      applicable: true,
      passed: conformance.passed === true,
      reasons: Array.isArray(conformance.reasons)
        ? conformance.reasons
        : [],
      report: conformance
    }
  };
}

function hasArtifactOption(options) {
  return Boolean(
    options.artifactTarball ||
    options.artifactRoot ||
    options.conformanceReport
  );
}

function validateDevelopmentArtifactInvocation(options) {
  for (const [field, flag] of [
    [options.artifactTarball, "--artifact-tarball"],
    [options.artifactRoot, "--artifact-root"],
    [options.conformanceReport, "--conformance-report"]
  ]) {
    if (!field) {
      throw new Error(
        `Artifact-bound development evaluation requires ${flag}.`
      );
    }
  }
}

function observeDevelopmentIdentity(root) {
  const manifest = readBoundedJson(
    path.join(root, "package.json"),
    64 * 1024
  );
  const commit = readGitScalar(root, ["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(
      "Artifact-bound development evaluation requires a known full HEAD."
    );
  }
  if (
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)
  ) {
    throw new Error(
      "Artifact-bound development evaluation requires a semantic package version."
    );
  }
  return { commit, version: manifest.version };
}

function readGitScalar(root, args) {
  const result = runGit(root, args, {
    maxOutputBytes: 64 * 1024,
    timeoutMs: 5_000
  });
  if (!result.ok) {
    throw new Error("Unable to observe the development candidate identity.");
  }
  return result.stdout.trim();
}

function parseArgs(argv) {
  const options = {
    corpus: null,
    cache: null,
    fetch: true,
    json: false,
    jsonOutput: null,
    requireRole: null,
    repos: [],
    expectedCorpusSha256: null,
    artifactTarball: null,
    artifactRoot: null,
    conformanceReport: null,
    rankingTraceDirectory: null,
    traceProtocolSha256: null,
    traceSourceCommit: null,
    expectedD2aSha256: null,
    postCorrectionAuthoritySha256: null
  };
  const valueFlags = new Map([
    ["--corpus", "corpus"],
    ["--cache", "cache"],
    ["--json-output", "jsonOutput"],
    ["--require-role", "requireRole"],
    ["--expected-corpus-sha256", "expectedCorpusSha256"],
    ["--artifact-tarball", "artifactTarball"],
    ["--artifact-root", "artifactRoot"],
    ["--conformance-report", "conformanceReport"],
    ["--ranking-trace-directory", "rankingTraceDirectory"],
    ["--trace-protocol-sha256", "traceProtocolSha256"],
    ["--trace-source-commit", "traceSourceCommit"],
    ["--expected-d2a-sha256", "expectedD2aSha256"],
    [
      "--post-correction-authority-sha256",
      "postCorrectionAuthoritySha256"
    ]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (valueFlags.has(arg)) {
      options[valueFlags.get(arg)] = requireValue(argv, ++index, arg);
    } else if (arg === "--repo") {
      options.repos.push(requireValue(argv, ++index, arg));
    } else if (arg === "--no-fetch") {
      options.fetch = false;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (
    options.requireRole &&
    !["development", "release"].includes(options.requireRole)
  ) {
    throw new Error(
      "--require-role must be development or release."
    );
  }
  if (
    options.expectedCorpusSha256 &&
    !/^[0-9a-f]{64}$/.test(options.expectedCorpusSha256)
  ) {
    throw new Error(
      "--expected-corpus-sha256 must be lowercase SHA-256."
    );
  }
  const traceFields = [
    options.rankingTraceDirectory,
    options.traceProtocolSha256,
    options.traceSourceCommit,
    options.expectedD2aSha256
  ];
  if (
    traceFields.some(Boolean) &&
    !traceFields.every(Boolean)
  ) {
    throw new Error(
      "D.2E tracing requires its directory, protocol hash, source commit, and D.2A hash together."
    );
  }
  if (
    options.traceProtocolSha256 &&
    !/^[0-9a-f]{64}$/.test(options.traceProtocolSha256)
  ) {
    throw new Error("--trace-protocol-sha256 must be lowercase SHA-256.");
  }
  if (
    options.traceSourceCommit &&
    !/^[0-9a-f]{40}$/.test(options.traceSourceCommit)
  ) {
    throw new Error("--trace-source-commit must be a full Git commit.");
  }
  if (
    options.expectedD2aSha256 &&
    !/^[0-9a-f]{64}$/.test(options.expectedD2aSha256)
  ) {
    throw new Error("--expected-d2a-sha256 must be lowercase SHA-256.");
  }
  if (
    options.postCorrectionAuthoritySha256 &&
    options.postCorrectionAuthoritySha256 !==
      POST_CORRECTION_AUTHORITY_SHA256
  ) {
    throw new Error(
      "--post-correction-authority-sha256 does not match the frozen authority."
    );
  }
  if (
    options.postCorrectionAuthoritySha256 &&
    !traceFields.every(Boolean)
  ) {
    throw new Error(
      "Post-correction evaluation requires the complete D.2E trace invocation."
    );
  }
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function writeJsonOutput(outputPath, run, canonical = false) {
  const resolved = path.resolve(outputPath);
  const parent = canonicalDirectory(path.dirname(resolved));
  const relative = path.basename(resolved);
  if (canonical) {
    writePostCorrectionJsonFile(parent, relative, run);
    return;
  }
  atomicWriteContained(
    parent,
    relative,
    `${safeJsonStringify(run)}\n`
  );
}

function prepareTraceAttempt(options, corpus, artifactOptions) {
  if (
    corpus.evaluation_role !== "development" ||
    options.requireRole !== "development" ||
    options.fetch !== false ||
    options.repos.length !== 0
  ) {
    throw new Error(
      "D.2E tracing requires the complete development corpus with --no-fetch and no subset."
    );
  }
  if (
    !artifactOptions.artifactSha256 ||
    artifactOptions.analyzerSource !== "installed-artifact"
  ) {
    throw new Error(
      "D.2E tracing requires the exact installed artifact."
    );
  }
  const identity = observeDevelopmentIdentity(repoRoot);
  const gitState = observeTraceGitState(repoRoot);
  if (identity.commit !== options.traceSourceCommit) {
    throw new Error(
      "D.2E trace source commit does not match the current HEAD."
    );
  }
  const protocolPath = path.join(repoRoot, "eval", "d2e", "PROTOCOL.md");
  const protocolSha256 = sha256BoundedFile(protocolPath, 1024 * 1024);
  if (protocolSha256 !== options.traceProtocolSha256) {
    throw new Error("D.2E protocol SHA-256 does not match.");
  }
  const d2aPath = path.join(
    repoRoot,
    "eval",
    "results",
    "development-0.4.0-rc.1-d2a-74208b9a.json"
  );
  const d2aSha256 = sha256BoundedFile(d2aPath, 8 * 1024 * 1024);
  if (d2aSha256 !== options.expectedD2aSha256) {
    throw new Error("Frozen D.2A report SHA-256 does not match.");
  }
  const d2a = readBoundedJson(d2aPath, 8 * 1024 * 1024);
  const cache = verifyFrozenDevelopmentCache(
    options.cache,
    d2a.cache_root,
    corpus
  );
  const requestedTraceRoot = path.resolve(
    options.rankingTraceDirectory
  );
  const expectedReport = path.join(
    requestedTraceRoot,
    "raw-report.json"
  );
  if (path.resolve(options.jsonOutput || "") !== expectedReport) {
    throw new Error(
      "D.2E --json-output must be raw-report.json in the attempt root."
    );
  }
  const traceRoot = prepareAbsentTraceRoot(requestedTraceRoot);
  const postCorrection = Boolean(
    options.postCorrectionAuthoritySha256
  );
  const caseDirectory = path.join(
    traceRoot,
    postCorrection ? "traces" : "cases"
  );
  fs.mkdirSync(caseDirectory, { mode: 0o700 });
  const traceSchemaPath = path.join(
    repoRoot,
    "eval",
    "d2e",
    "trace.schema.json"
  );
  const analysisSchemaPath = path.join(
    repoRoot,
    "eval",
    "d2e",
    "analysis.schema.json"
  );
  const authority = postCorrection
    ? loadPostCorrectionAuthority(repoRoot).authority
    : null;
  const binding = {
    schema: postCorrection
      ? "kanon-d2e-post-correction-attempt-binding-v1"
      : "kanon-d2e-trace-attempt-binding-v1",
    attempt: 1,
    retries: 0,
    source_commit: identity.commit,
    branch: gitState.branch,
    upstream: gitState.upstream,
    ahead: gitState.ahead,
    behind: gitState.behind,
    worktree_clean: gitState.worktreeClean,
    package_version: identity.version,
    protocol_sha256: protocolSha256,
    trace_schema_sha256:
      sha256BoundedFile(traceSchemaPath, 1024 * 1024),
    analysis_schema_sha256:
      sha256BoundedFile(analysisSchemaPath, 1024 * 1024),
    corpus_sha256: corpus._manifest.sha256,
    corpus_case_count: corpus.cases.length,
    d2a_report_sha256: d2aSha256,
    cache_identity_sha256: cache.identitySha256,
    artifact_sha256: artifactOptions.artifactSha256,
    conformance_report_sha256: sha256BoundedFile(
      options.conformanceReport,
      2 * 1024 * 1024
    ),
    conformance: {
      applicable:
        artifactOptions.artifactConformance?.applicable === true,
      passed:
        artifactOptions.artifactConformance?.passed === true,
      check_count:
        artifactOptions.artifactConformance?.report?.checks?.length || 0
    },
    configuration: {
      evaluation_role: "development",
      fetch: false,
      subset: false,
      cache_mode: "exact-d2a-revision-bound-offline",
      cache_case_count: cache.caseCount,
      analysis_timeout_ms: 35_000,
      child_max_old_space_mb: 512,
      child_timezone: "UTC",
      child_locale: "C",
      prediction_channel_max_bytes: 4 * 1024 * 1024,
      scan: {
        maxFiles: 25_000,
        maxEntries: 100_000,
        maxFileBytes: 1_000_000,
        maxTotalHashBytes: 128 * 1024 * 1024,
        maxTotalTextBytes: 32 * 1024 * 1024,
        maxElapsedMs: 30_000,
        useGitIgnore: false
      }
    },
    ...(postCorrection
      ? {
          authority_commit:
            "2ee3091005b86db6eada2d2b15e0deeae96deb46",
          authority_sha256: POST_CORRECTION_AUTHORITY_SHA256,
          correction_commit: authority.bindings.correction_commit,
          ordered_revisions_sha256:
            authority.bindings.ordered_revisions_sha256,
          paired_configuration_file_sha256:
            authority.bindings.paired_configuration_file_sha256,
          paired_configuration_canonical_sha256:
            authority.bindings.canonical_paired_configuration_sha256,
          scoring_policy_sha256:
            authority.bindings.scoring_policy_sha256,
          threshold_projection_sha256:
            authority.bindings.threshold_projection_sha256,
          public_capability_sha256:
            authority.bindings.public_capability_sha256,
          invocation: {
            artifact_bound: true,
            full_corpus: true,
            no_fetch: true,
            runner: "scripts/eval-corpus.js",
            runner_invocations: 1,
            trace_modes: ["trace-on", "trace-off"]
          }
        }
      : {})
  };
  if (postCorrection) {
    writePostCorrectionJsonFile(
      traceRoot,
      "attempt-binding.json",
      binding
    );
  } else {
    atomicWriteContained(
      traceRoot,
      "attempt-binding.json",
      `${safeJsonStringify(binding)}\n`
    );
  }
  const attempt = {
    root: traceRoot,
    caseDirectory,
    binding,
    postCorrection
  };
  if (postCorrection) {
    activePostCorrectionAttempt = attempt;
  }
  return attempt;
}

function verifyFrozenDevelopmentCache(selectedPath, d2aPath, corpus) {
  if (
    typeof selectedPath !== "string" ||
    typeof d2aPath !== "string"
  ) {
    throw new Error("D.2E tracing requires the explicit D.2A cache.");
  }
  const selected = canonicalDirectory(path.resolve(selectedPath));
  const frozen = canonicalDirectory(path.resolve(d2aPath));
  if (selected !== frozen) {
    throw new Error(
      "D.2E cache does not match the frozen D.2A cache root."
    );
  }
  const bindings = [];
  for (const [index, item] of corpus.cases.entries()) {
    const cacheName = repositoryCacheName(
      item.repository,
      item.revision
    );
    const checkout = resolveContainedPath(selected, cacheName, {
      type: "directory"
    });
    const gitMetadata = resolveContainedPath(
      selected,
      `${cacheName}/.git`,
      { type: "any" }
    );
    if (!checkout.ok || gitMetadata.status !== "missing") {
      throw new Error(
        `D.2E frozen cache entry ${index + 1} is unavailable or retains Git metadata.`
      );
    }
    bindings.push({
      ordinal: index + 1,
      id: item.id,
      revision: item.revision,
      cache_name: cacheName
    });
  }
  if (fs.readdirSync(selected).length !== bindings.length) {
    throw new Error("D.2E frozen cache contains unexpected entries.");
  }
  return {
    caseCount: bindings.length,
    identitySha256: sha256Bytes(
      Buffer.from(JSON.stringify(bindings))
    )
  };
}

function observeTraceGitState(root) {
  const branch = readGitScalar(root, [
    "symbolic-ref",
    "--short",
    "HEAD"
  ]);
  const upstream = readGitScalar(root, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}"
  ]);
  const relation = readGitScalar(root, [
    "rev-list",
    "--left-right",
    "--count",
    "HEAD...@{upstream}"
  ]).split(/\s+/).map(Number);
  const status = readGitScalar(root, [
    "status",
    "--porcelain",
    "--untracked-files=all"
  ]);
  if (
    branch !== "release/v.1.0.0" ||
    upstream !== "origin/release/v.1.0.0" ||
    relation.length !== 2 ||
    !relation.every(Number.isInteger) ||
    relation[1] !== 0 ||
    status !== ""
  ) {
    throw new Error(
      "D.2E tracing requires the clean release/v.1.0.0 branch zero behind its exact upstream."
    );
  }
  return {
    branch,
    upstream,
    ahead: relation[0],
    behind: relation[1],
    worktreeClean: true
  };
}

function prepareAbsentTraceRoot(directory) {
  const resolved = path.resolve(directory);
  const lexicalTemporaryRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== lexicalTemporaryRoot) {
    throw new Error(
      "D.2E trace directory must be a direct child of the OS temporary root."
    );
  }
  if (fs.existsSync(resolved)) {
    throw new Error("D.2E trace directory must be absent.");
  }
  const temporaryRoot = canonicalDirectory(lexicalTemporaryRoot);
  fs.mkdirSync(path.join(temporaryRoot, path.basename(resolved)), {
    mode: 0o700
  });
  return canonicalDirectory(resolved);
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256BoundedFile(filePath, limit) {
  const file = containedSelectedFile(filePath);
  if (file.stat.size > limit) {
    throw new Error(`Artifact exceeds its ${limit}-byte limit.`);
  }
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file.path))
    .digest("hex");
}

function readBoundedJson(filePath, limit) {
  const file = containedSelectedFile(filePath);
  if (file.stat.size > limit) {
    throw new Error(`JSON input exceeds its ${limit}-byte limit.`);
  }
  return JSON.parse(fs.readFileSync(file.path, "utf8"));
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

function helpText() {
  return `Usage: npm run eval:corpus -- [options]

Development options:
  --corpus <path>                 Corpus manifest
  --cache <path>                  Isolated materialization cache
  --repo <id>                     Development-only subset
  --no-fetch                      Require cached materializations
  --json                          Emit the raw report
  --json-output <path>            Write the raw report atomically
  --require-role <role>           Require development or release

D.2E trace options (all required together; development/full/no-fetch only):
  --ranking-trace-directory <dir> One absent direct child of the OS temp root
  --trace-protocol-sha256 <sha>   Frozen D.2E protocol identity
  --trace-source-commit <commit>  Exact clean instrumentation commit
  --expected-d2a-sha256 <sha>     Frozen D.2A raw-report identity
  --post-correction-authority-sha256 <sha>
                                    Freeze the single paired post-correction attempt

Required together for an artifact-bound development run or release:
  --artifact-tarball <path>       Exact packed artifact
  --artifact-root <path>          Empty-prefix installation of that artifact
  --conformance-report <path>     Wrapper/read/write conformance report

Additionally required for release:
  --expected-corpus-sha256 <sha>  Frozen manifest identity
`;
}
