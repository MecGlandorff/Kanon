#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  atomicWriteContained
} from "../src/persistence/safe-fs.js";
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

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

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
    artifactOptions = await loadReleaseArtifact(options, corpus);
  }

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
    ...artifactOptions
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
    writeJsonOutput(options.jsonOutput, run);
  }
  process.exitCode = run.summary.passed ? 0 : 1;
} catch (error) {
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

async function loadReleaseArtifact(options, corpus) {
  const artifactSha256 = sha256BoundedFile(
    options.artifactTarball,
    128 * 1024 * 1024
  );
  const conformance = readBoundedJson(
    options.conformanceReport,
    2 * 1024 * 1024
  );
  if (conformance.artifact_sha256 !== artifactSha256) {
    throw new Error(
      "Conformance report artifact hash does not match the tarball."
    );
  }
  if (
    conformance.candidate_commit !== corpus.release.candidate_commit ||
    conformance.candidate_version !== corpus.release.candidate_version
  ) {
    throw new Error(
      "Conformance report candidate identity does not match the corpus."
    );
  }

  const artifactRoot = canonicalDirectory(options.artifactRoot);
  const analyzer = resolveContainedPath(
    artifactRoot,
    "skills/kanon/runtime/src/analyze.js",
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
    analyzerVersion: corpus.release.candidate_version,
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
    conformanceReport: null
  };
  const valueFlags = new Map([
    ["--corpus", "corpus"],
    ["--cache", "cache"],
    ["--json-output", "jsonOutput"],
    ["--require-role", "requireRole"],
    ["--expected-corpus-sha256", "expectedCorpusSha256"],
    ["--artifact-tarball", "artifactTarball"],
    ["--artifact-root", "artifactRoot"],
    ["--conformance-report", "conformanceReport"]
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
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function writeJsonOutput(outputPath, run) {
  const resolved = path.resolve(outputPath);
  const parent = canonicalDirectory(path.dirname(resolved));
  const relative = path.basename(resolved);
  atomicWriteContained(
    parent,
    relative,
    `${safeJsonStringify(run)}\n`
  );
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

Required for release:
  --expected-corpus-sha256 <sha>  Frozen manifest identity
  --artifact-tarball <path>       Exact packed artifact
  --artifact-root <path>          Empty-prefix installation of that artifact
  --conformance-report <path>     Wrapper/read/write conformance report
`;
}
