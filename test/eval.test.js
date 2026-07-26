import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  analyzeCase,
  aggregateScores,
  assertNoCorpusOverlap,
  assertReleasePolicyMatches,
  loadCorpus,
  renderCorpusReport,
  runCorpus,
  scoreCase,
  scoreErrorCase,
  validateCorpus,
  wilsonInterval
} from "../scripts/lib/eval-corpus.js";
import { HEURISTIC_REGISTRY } from "../src/code-intel/heuristics.js";
import { validateDevelopmentReport } from "../scripts/lib/development-report.js";
import { npmInvocation } from "../scripts/lib/npm-runner.js";
import { makeFixture, readJson, sha256File } from "./helpers.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const corpus = loadCorpus(path.join(repoRoot, "eval", "corpus.json"));
const policy = corpus.policy;
const categories = [
  "python-ml",
  "go-service",
  "monorepo",
  "rust-cli",
  "python-web"
];

test("development corpus is a 30-case compatibility sample with provenance", () => {
  assert.equal(corpus.schema_version, 2);
  assert.equal(corpus.evaluation_role, "development");
  assert.equal(corpus.cases.length, 30);
  assert.deepEqual(
    new Set(corpus.cases.map((item) => item.category)),
    new Set(categories)
  );
  for (const category of categories) {
    assert.equal(
      corpus.cases.filter((item) => item.category === category).length,
      6
    );
  }
  for (const item of corpus.cases) {
    assert.match(item.revision, /^[0-9a-f]{40}$/);
    assert.equal(item.labels.important_files.length, 5);
    for (const label of item.labels.important_files) {
      assert.ok(label.path);
      assert.ok([1, 2, 3].includes(label.relevance));
      assert.ok(label.rationale.length >= 10);
      assert.ok(label.sources.length > 0);
    }
    for (const command of [item.labels.run, item.labels.test]) {
      if (command) {
        assert.ok(command.accepted.length > 0);
        assert.ok(command.rationale.length >= 10);
        assert.ok(command.sources.length > 0);
      }
    }
  }
});

test("production heuristics are registered with reviewable provenance", () => {
  assert.ok(HEURISTIC_REGISTRY.length >= 7);
  for (const heuristic of HEURISTIC_REGISTRY) {
    assert.match(heuristic.id, /^[a-z0-9-]+$/);
    assert.ok(heuristic.rationale.length >= 10);
    assert.ok(heuristic.ecosystems.length > 0);
    assert.ok(heuristic.failure_modes.length >= 10);
    assert.match(
      heuristic.corpus_exposure,
      /predates|during|independent/i
    );
  }
  const table = fs.readFileSync(
    path.join(repoRoot, "docs", "heuristics.md"),
    "utf8"
  );
  assert.match(table, /Generic rationale/);
  assert.match(table, /Failure modes/);
  assert.match(table, /corpus exposure/i);
});

test("corpus tokens remain only a tripwire, not the control mechanism", () => {
  const source = javascriptFiles(
    path.join(repoRoot, "src", "code-intel")
  )
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  for (const token of [
    "configurator.py",
    "query-core",
    "cmdServeExample",
    "examples/base/main.go",
    "internal/home/home.go",
    "micrograd",
    "nanogpt",
    "pocketbase",
    "turborepo",
    "tanstack",
    "pretix",
    "bakerydemo"
  ]) {
    assert.equal(
      source.toLowerCase().includes(token.toLowerCase()),
      false,
      `production heuristic contains development answer token: ${token}`
    );
  }
});

test("release metadata requires three independent named roles", () => {
  const release = releaseClone();
  delete release.release.implementation_author;
  assert.throws(
    () => validateCorpus(release),
    /implementation_author/
  );

  const duplicate = releaseClone();
  duplicate.release.labeler = duplicate.release.implementation_author;
  assert.throws(
    () => validateCorpus(duplicate),
    /must be distinct/
  );
});

test("release corpora cannot reuse visible development repositories", () => {
  const release = releaseClone();
  validateCorpus(release);
  assert.throws(
    () => assertNoCorpusOverlap(release, corpus),
    /overlaps visible development data/
  );
});

test("release thresholds must exactly match the frozen policy", () => {
  const release = releaseClone();
  release.policy.minimum_precision = 0.79;
  assert.throws(
    () => assertReleasePolicyMatches(release, corpus),
    /policy differs/
  );
});

test("release --repo and partial selection are rejected before checkout", async () => {
  const release = releaseClone();
  await assert.rejects(
    () =>
      runCorpus(release, {
        repoIds: [release.cases[0].id],
        fetch: false
      }),
    /rejects --repo/
  );

  const manifest = path.join(
    makeFixture({}, "kanon-release-manifest-"),
    "release.json"
  );
  fs.writeFileSync(manifest, `${JSON.stringify(release)}\n`);
  const invocation = spawnSync(
    process.execPath,
    [
      "scripts/eval-corpus.js",
      "--corpus",
      manifest,
      "--require-role",
      "release",
      "--repo",
      release.cases[0].id
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 20_000
    }
  );
  assert.equal(invocation.status, 2);
  assert.match(invocation.stderr, /Release evaluation rejects --repo/);
});

test("multi-equivalent command labels score cwd and command exactly", () => {
  const item = fixtureCase({
    run: {
      accepted: [
        { cwd: ".", command: "npm test" },
        { cwd: ".", command: "npm run test" }
      ],
      rationale: "Two package-manager spellings are directly supported.",
      sources: ["package.json"]
    }
  });
  const accepted = scoreCase(
    item,
    fixtureAnalysis({
      run: [{ cwd: ".", command: "npm  run   test" }]
    }),
    policy
  );
  const wrongCwd = scoreCase(
    item,
    fixtureAnalysis({
      run: [{ cwd: "packages/app", command: "npm test" }]
    }),
    policy
  );

  assert.equal(accepted.dimensions.run_command.tp, 1);
  assert.equal(accepted.dimensions.run_command.fp, 0);
  assert.equal(wrongCwd.dimensions.run_command.fp, 1);
  assert.equal(wrongCwd.dimensions.run_command.fn, 1);
});

test("false positives retain their predeclared five-to-one cost", () => {
  const result = scoreCase(
    fixtureCase(),
    fixtureAnalysis({
      importantFiles: ["a", "b", "c", "d", "wrong"]
    }),
    policy
  );
  assert.equal(result.dimensions.important_files.fp, 1);
  assert.equal(result.dimensions.important_files.fn, 1);
  assert.equal(result.totals.weighted_error, 6);
});

test("partial execution can never pass or print PASS", () => {
  const results = perfectResults().slice(0, 29);
  const summary = aggregateScores(results, policy, {
    expectedCaseCount: 30
  });
  const report = renderCorpusReport(reportFixture(summary, results));

  assert.equal(summary.passed, false);
  assert.ok(
    summary.failures.some((failure) => /partial execution/.test(failure))
  );
  assert.doesNotMatch(report, /Release gate: PASS/);
  assert.match(report, /Release gate: FAIL/);
});

test("a zero-percent category blocks otherwise strong micro totals", () => {
  const results = perfectResults();
  for (const result of results.filter(
    (item) => item.category === "python-web"
  )) {
    result.dimensions = badDimensions();
    result.totals = { tp: 0, fp: 3, fn: 7 };
  }
  const summary = aggregateScores(results, policy, {
    expectedCaseCount: 30
  });

  assert.equal(summary.passed, false);
  assert.equal(summary.categories["python-web"].precision, 0);
  assert.equal(summary.categories["python-web"].recall, 0);
  assert.ok(
    summary.failures.some((failure) =>
      /category python-web/.test(failure)
    )
  );
});

test("underfilled categories fail corpus validation", () => {
  const underfilled = structuredClone(corpus);
  const web = underfilled.cases.filter(
    (item) => item.category === "python-web"
  );
  web[0].category = "python-ml";
  web[1].category = "python-ml";
  assert.throws(
    () => validateCorpus(underfilled),
    /category python-web has 4 cases/
  );
});

test("every dimension threshold is independently gated", () => {
  for (const dimension of [
    "important_files",
    "run_command",
    "test_command"
  ]) {
    const results = perfectResults();
    for (const result of results) {
      result.dimensions[dimension] = {
        tp: 0,
        fp: 1,
        fn: 1
      };
      result.totals = sumDimensionCounts(result.dimensions);
    }
    const summary = aggregateScores(results, policy, {
      expectedCaseCount: 30
    });
    assert.ok(
      summary.failures.some((failure) =>
        failure.startsWith(`${dimension} `)
      ),
      `${dimension} threshold was not exercised`
    );
  }
});

test("every category threshold is independently gated", () => {
  for (const category of categories) {
    const results = perfectResults();
    for (const result of results.filter(
      (item) => item.category === category
    )) {
      result.dimensions = badDimensions();
      result.totals = sumDimensionCounts(result.dimensions);
    }
    const summary = aggregateScores(results, policy, {
      expectedCaseCount: 30
    });
    assert.ok(
      summary.failures.some((failure) =>
        failure.startsWith(`category ${category} `)
      ),
      `${category} threshold was not exercised`
    );
  }
});

test("analysis errors remain visible failures in raw results", () => {
  const item = fixtureCase();
  const error = scoreErrorCase(
    item,
    new Error("fixture analysis failed"),
    policy
  );
  const results = perfectResults();
  results[0] = {
    ...error,
    category: results[0].category,
    id: results[0].id
  };
  const summary = aggregateScores(results, policy, {
    expectedCaseCount: 30
  });

  assert.equal(error.analysis_error.message, "fixture analysis failed");
  assert.equal(summary.analysis_error_count, 1);
  assert.equal(summary.passed, false);
  assert.ok(
    summary.failures.some((failure) => /analysis error/.test(failure))
  );
});

test("prerelease validation accepts threshold failure but never partial execution", () => {
  const results = perfectResults();
  const summary = aggregateScores(results, policy, {
    expectedCaseCount: 30
  });
  summary.passed = false;
  summary.failures = ["fixture threshold failure"];
  const run = reportFixture(summary, results);
  run.corpus = {
    evaluation_role: "development",
    manifest_sha256: "b".repeat(64),
    selected_case_count: 30,
    total_case_count: 30
  };
  run.candidate = {
    commit: "a".repeat(40),
    version: "0.4.0-rc.1",
    worktree_clean: true
  };
  run.analyzer.version = "0.4.0-rc.1";

  const accepted = validateDevelopmentReport(run, {
    candidateCommit: "a".repeat(40),
    candidateVersion: "0.4.0-rc.1"
  });
  assert.equal(accepted.execution_complete, true);
  assert.equal(accepted.thresholds_passed, false);
  assert.deepEqual(accepted.failures, ["fixture threshold failure"]);
  assert.throws(
    () =>
      validateDevelopmentReport(run, {
        candidateCommit: "a".repeat(40),
        candidateVersion: "0.4.0-rc.1",
        requireThresholdPass: true
      }),
    /did not pass its thresholds/
  );

  run.results.pop();
  assert.throws(
    () =>
      validateDevelopmentReport(run, {
        candidateCommit: "a".repeat(40),
        candidateVersion: "0.4.0-rc.1"
      }),
    /partial/
  );
});

test("prerelease binding records a complete threshold-failing development report", () => {
  const candidateCommit = "a".repeat(40);
  const candidateVersion = "0.4.0-rc.1";
  const root = makeFixture({}, "kanon-release-binding-");
  const tarball = path.join(root, "kanon-0.4.0-rc.1.tgz");
  fs.writeFileSync(tarball, "fixture tarball");
  const artifactSha256 = sha256File(tarball);
  for (const platform of ["ubuntu", "windows", "macos"]) {
    fs.writeFileSync(
      path.join(root, `conformance-${platform}.json`),
      `${JSON.stringify({
        passed: true,
        artifact_sha256: artifactSha256,
        candidate_commit: candidateCommit,
        candidate_version: candidateVersion
      })}\n`
    );
  }

  const results = perfectResults();
  const summary = aggregateScores(results, policy, {
    expectedCaseCount: 30
  });
  summary.passed = false;
  summary.failures = ["fixture threshold failure"];
  const development = reportFixture(summary, results);
  development.corpus = {
    evaluation_role: "development",
    manifest_sha256: "b".repeat(64),
    selected_case_count: 30,
    total_case_count: 30
  };
  development.candidate = {
    commit: candidateCommit,
    version: candidateVersion,
    worktree_clean: true
  };
  development.analyzer.version = candidateVersion;
  fs.writeFileSync(
    path.join(root, "development-eval.json"),
    `${JSON.stringify(development)}\n`
  );

  const invocation = spawnSync(
    process.execPath,
    [
      "scripts/release-bind.js",
      "--bundle",
      root,
      "--candidate-commit",
      candidateCommit,
      "--candidate-version",
      candidateVersion,
      "--artifact-sha256",
      artifactSha256,
      "--release-kind",
      "prerelease"
    ],
    commandOptions(20_000)
  );
  assert.equal(invocation.status, 0, invocation.stderr);
  const manifest = readJson(path.join(root, "release-manifest.json"));
  assert.equal(manifest.development_execution_complete, true);
  assert.equal(manifest.development_thresholds_passed, false);
  assert.deepEqual(
    manifest.development_threshold_failures,
    ["fixture threshold failure"]
  );
  assert.equal(manifest.held_out_capability_estimate_claimed, false);
});

test("per-case analysis timeout is enforced by process isolation", () => {
  const root = makeFixture({
    "analyzer.mjs":
      "export function analyzeRepo() { while (true) {} }\n"
  });
  assert.throws(
    () =>
      analyzeCase(
        path.join(root, "analyzer.mjs"),
        root,
        { revision: "a".repeat(40) },
        250
      ),
    /timed out after 250 ms/
  );
});

test("incomplete scans are reported but only block release evaluation", () => {
  const results = perfectResults();
  results[0].scan_complete = false;
  const development = aggregateScores(results, policy, {
    expectedCaseCount: 30,
    requireCompleteScans: false
  });
  const release = aggregateScores(results, policy, {
    expectedCaseCount: 30,
    requireCompleteScans: true
  });

  assert.equal(development.incomplete_scan_count, 1);
  assert.equal(development.passed, true);
  assert.equal(release.passed, false);
  assert.ok(
    release.failures.some((failure) => /scan.*incomplete/.test(failure))
  );
});

test("reports include abstentions, coverage, macros, and Wilson intervals", () => {
  const results = perfectResults();
  results[0].abstentions.run_command = true;
  const summary = aggregateScores(results, policy, {
    expectedCaseCount: 30
  });
  const interval = wilsonInterval(8, 10);

  assert.equal(summary.abstentions.run_command, 1);
  assert.ok(summary.prediction_coverage.run_command < 1);
  assert.ok(Number.isFinite(summary.macro_over_category.precision));
  assert.ok(Number.isFinite(summary.macro_over_dimension.recall));
  assert.ok(summary.totals.precision_interval);
  assert.ok(summary.categories["python-ml"].recall_interval);
  assert.ok(interval.lower < 0.8);
  assert.ok(interval.upper > 0.8);
});

test("empty, pathological, and nonpositive policies are rejected", () => {
  for (const mutation of [
    (value) => {
      value.policy = {};
    },
    (value) => {
      value.policy.false_positive_cost = 0;
    },
    (value) => {
      value.policy.false_positive_cost = 2;
    },
    (value) => {
      value.policy.dimension_thresholds.run_command.minimum_precision = 0;
    }
  ]) {
    const invalid = structuredClone(corpus);
    mutation(invalid);
    assert.throws(() => validateCorpus(invalid));
  }
});

test("publication requires an explicit workflow choice", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github", "workflows", "ci.yml"),
    "utf8"
  );

  assert.match(
    workflow,
    /publish:\n\s+description: Publish the validated tarball and create its tag\n\s+required: true\n\s+default: validate-only\n\s+type: choice\n\s+options:\n\s+- validate-only\n\s+- publish/
  );
  assert.match(workflow, /inputs\.publish == 'publish'/);
  assert.match(
    workflow,
    /always\(\) &&\n\s+github\.event_name == 'workflow_dispatch' &&\n\s+inputs\.publish == 'publish' &&\n\s+needs\.release-gate\.result == 'success'/
  );
  assert.doesNotMatch(
    workflow,
    /github\.event_name == 'workflow_dispatch' &&\n\s+inputs\.publish\s*(?:\n|$)/
  );
});

test("one exact tarball passes installed Bash or PowerShell conformance", {
  timeout: 120_000
}, () => {
  const stage = makeFixture({}, "kanon-package-stage-");
  const packed = makeFixture({}, "kanon-packed-");
  const repacked = makeFixture({}, "kanon-repacked-");
  const installParent = makeFixture({}, "kanon-install-parent-");
  const installRoot = path.join(installParent, "installed");
  const reportPath = path.join(packed, "conformance.json");
  const build = spawnSync(
    process.execPath,
    ["scripts/build-package.js", "--output", stage],
    commandOptions()
  );
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const packInvocation = npmInvocation([
    "pack",
    stage,
    "--pack-destination",
    packed
  ]);
  const pack = spawnSync(
    packInvocation.command,
    packInvocation.args,
    commandOptions()
  );
  assert.equal(pack.status, 0, pack.stderr || pack.stdout);
  const tarball = fs
    .readdirSync(packed)
    .filter((file) => file.endsWith(".tgz"))
    .map((file) => path.join(packed, file))[0];
  assert.ok(tarball);
  const secondPackInvocation = npmInvocation([
    "pack",
    stage,
    "--pack-destination",
    repacked
  ]);
  const secondPack = spawnSync(
    secondPackInvocation.command,
    secondPackInvocation.args,
    commandOptions()
  );
  assert.equal(
    secondPack.status,
    0,
    secondPack.stderr || secondPack.stdout
  );
  const secondTarball = fs
    .readdirSync(repacked)
    .filter((file) => file.endsWith(".tgz"))
    .map((file) => path.join(repacked, file))[0];
  assert.equal(sha256File(secondTarball), sha256File(tarball));

  const conform = spawnSync(
    process.execPath,
    [
      "scripts/conform-artifact.js",
      "--tarball",
      tarball,
      "--install-root",
      installRoot,
      "--output",
      reportPath,
      "--candidate-commit",
      "a".repeat(40),
      "--candidate-version",
      "0.4.0-rc.1"
    ],
    commandOptions(120_000)
  );
  assert.equal(conform.status, 0, conform.stderr || conform.stdout);
  const report = readJson(reportPath);

  assert.equal(report.passed, true, report.reasons.join("\n"));
  assert.equal(report.artifact_sha256, sha256File(tarball));
  assert.equal(report.candidate_version, "0.4.0-rc.1");
  assert.ok(
    report.checks.some((check) =>
      /wrapper refresh/.test(check.name)
    )
  );
  assert.ok(
    report.checks.some((check) =>
      /destructive package script was not executed/.test(check.name)
    )
  );
});

test("package staging refuses a symlinked output directory", (t) => {
  let stage;
  const parent = makeFixture({}, "kanon-stage-parent-");
  const outside = makeFixture({}, "kanon-stage-outside-");
  stage = path.join(parent, "stage");
  try {
    fs.symlinkSync(outside, stage, "dir");
  } catch {
    t.skip("Symbolic links are unavailable.");
    return;
  }
  const build = spawnSync(
    process.execPath,
    ["scripts/build-package.js", "--output", stage],
    commandOptions()
  );
  assert.notEqual(build.status, 0);
  assert.match(build.stderr, /Unsafe package output|symbolic link|reparse/i);
  assert.deepEqual(fs.readdirSync(outside), []);
});

function releaseClone() {
  const release = structuredClone(corpus);
  release.evaluation_role = "release";
  release.release = {
    candidate_commit: "a".repeat(40),
    candidate_version: "0.4.0-rc.1",
    frozen_at: "2026-07-26T00:00:00Z",
    implementation_author: "implementation-fixture",
    labeler: "labeler-fixture",
    independent_reviewer: "reviewer-fixture"
  };
  return release;
}

function fixtureCase(options = {}) {
  const files = options.files || ["a", "b", "c", "d", "e"];
  return {
    id: "fixture/repo",
    category: "python-ml",
    repository: "https://github.com/fixture/repo.git",
    revision: "a".repeat(40),
    labels: {
      important_files: files.map((file) => ({
        path: file,
        relevance: 3,
        rationale: `Direct fixture evidence supports ${file}.`,
        sources: [file]
      })),
      run: options.run ?? null,
      test: options.test ?? null
    },
    strata: []
  };
}

function fixtureAnalysis(options = {}) {
  const importantFiles =
    options.importantFiles || ["a", "b", "c", "d", "e"];
  return {
    state: {
      important_files: importantFiles.map((file) => ({ path: file })),
      commands: {
        run: options.run || [],
        test: options.test || []
      },
      scan: { complete: true }
    }
  };
}

function perfectResults() {
  return categories.flatMap((category) =>
    Array.from({ length: 6 }, (_item, index) => {
      const dimensions = {
        important_files: { tp: 5, fp: 0, fn: 0 },
        run_command: { tp: 1, fp: 0, fn: 0 },
        test_command: { tp: 1, fp: 0, fn: 0 }
      };
      return {
        id: `${category}/fixture-${index}`,
        category,
        scan_complete: true,
        analysis_error: null,
        predictions: {
          important_files: ["a", "b", "c", "d", "e"],
          run: [{ cwd: ".", command: "run" }],
          test: [{ cwd: ".", command: "test" }]
        },
        labels: fixtureCase().labels,
        abstentions: {
          important_files: false,
          run_command: false,
          test_command: false
        },
        dimensions,
        totals: sumDimensionCounts(dimensions)
      };
    })
  );
}

function badDimensions() {
  return {
    important_files: { tp: 0, fp: 1, fn: 5 },
    run_command: { tp: 0, fp: 1, fn: 1 },
    test_command: { tp: 0, fp: 1, fn: 1 }
  };
}

function sumDimensionCounts(dimensions) {
  return Object.values(dimensions).reduce(
    (total, score) => ({
      tp: total.tp + score.tp,
      fp: total.fp + score.fp,
      fn: total.fn + score.fn
    }),
    { tp: 0, fp: 0, fn: 0 }
  );
}

function reportFixture(summary, results) {
  return {
    generated_at: "2026-07-26T00:00:00Z",
    candidate: { version: "0.4.0-rc.1", commit: "a".repeat(40) },
    analyzer: { version: "0.4.0-rc.1", source: "installed-artifact" },
    environment: {
      node: process.version,
      os: process.platform,
      architecture: process.arch
    },
    corpus: {
      evaluation_role: "release",
      manifest_sha256: "b".repeat(64)
    },
    artifact: {
      sha256: "c".repeat(64),
      conformance: { passed: true }
    },
    results,
    summary
  };
}

function commandOptions(timeout = 60_000) {
  const npmCache = path.join(
    os.tmpdir(),
    `kanon-test-npm-cache-${process.pid}`
  );
  return {
    cwd: repoRoot,
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_cache: npmCache,
      npm_config_fund: "false",
      npm_config_ignore_scripts: "true"
    },
    windowsHide: true
  };
}

function javascriptFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return javascriptFiles(target);
      }
      return entry.isFile() && entry.name.endsWith(".js")
        ? [target]
        : [];
    });
}
