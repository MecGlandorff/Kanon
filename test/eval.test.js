import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  aggregateScores,
  loadCorpus,
  scoreCase
} from "../scripts/lib/eval-corpus.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = loadCorpus(path.join(repoRoot, "eval", "corpus.json"));
const policy = corpus.policy;

test("evaluation corpus has 30 pinned, hand-labeled third-party cases", () => {
  assert.equal(corpus.cases.length, 30);
  assert.deepEqual(
    new Set(corpus.cases.map((item) => item.category)),
    new Set([
      "python-ml",
      "go-service",
      "monorepo",
      "rust-cli",
      "django-app",
      "no-readme"
    ])
  );
  for (const item of corpus.cases) {
    assert.equal(item.labels.important_files.length, 5);
    assert.match(item.revision, /^[0-9a-f]{40}$/);
    assert.ok(item.label_sources.length > 0);
  }
});

test("a false positive costs exactly five false negatives", () => {
  const result = scoreCase(
    fixtureCase({
      important_files: ["a", "b", "c", "d", "e"],
      run: null,
      test: null
    }),
    fixtureAnalysis({
      importantFiles: ["a", "b", "c", "d", "wrong"]
    }),
    policy
  );

  assert.equal(result.totals.fp, 1);
  assert.equal(result.totals.fn, 1);
  assert.equal(result.totals.weighted_error, 6);
});

test("inventing a command for a commandless repo is a false positive", () => {
  const result = scoreCase(
    fixtureCase({
      important_files: ["a", "b", "c", "d", "e"],
      run: null,
      test: null
    }),
    fixtureAnalysis({
      importantFiles: ["a", "b", "c", "d", "e"],
      run: [{ command: "npm start", cwd: "." }]
    }),
    policy
  );

  assert.equal(result.dimensions.run_command.fp, 1);
  assert.equal(result.dimensions.run_command.fn, 0);
  assert.equal(result.totals.weighted_error, 5);
});

test("command working directory is part of ground truth", () => {
  const item = fixtureCase({
    important_files: ["a", "b", "c", "d", "e"],
    run: { cwd: "src", command: "python manage.py runserver" },
    test: null
  });
  const wrongCwd = scoreCase(
    item,
    fixtureAnalysis({
      importantFiles: ["a", "b", "c", "d", "e"],
      run: [{ command: "python manage.py runserver", cwd: "." }]
    }),
    policy
  );
  const correct = scoreCase(
    item,
    fixtureAnalysis({
      importantFiles: ["a", "b", "c", "d", "e"],
      run: [{ command: "python  manage.py   runserver", cwd: "src/" }]
    }),
    policy
  );

  assert.deepEqual(
    {
      fp: wrongCwd.dimensions.run_command.fp,
      fn: wrongCwd.dimensions.run_command.fn
    },
    { fp: 1, fn: 1 }
  );
  assert.equal(correct.dimensions.run_command.tp, 1);
});

test("release gate enforces precision, recall, and weighted-error thresholds", () => {
  const weak = {
    dimensions: {
      important_files: { tp: 2, fp: 3, fn: 3 },
      run_command: { tp: 0, fp: 1, fn: 1 },
      test_command: { tp: 1, fp: 0, fn: 0 }
    },
    totals: { tp: 3, fp: 4, fn: 4 }
  };
  const summary = aggregateScores([weak], policy);
  assert.equal(summary.passed, false);
  assert.equal(summary.totals.weighted_error, 24);
  assert.equal(summary.failures.length, 3);
});

test("source scripts above 300 lines must be packaged internally", () => {
  for (const directory of ["src", "scripts", "bin"]) {
    for (const file of javascriptFiles(path.join(repoRoot, directory))) {
      const lineCount = countLines(file);
      assert.ok(
        lineCount <= 300,
        `${path.relative(repoRoot, file)} has ${lineCount} lines; split it behind a package facade`
      );
    }
  }
});

test("internal package modules stay below 250 lines", () => {
  for (const directory of [
    "src/analyze",
    "src/cli",
    "src/code-intel",
    "src/improve",
    "src/refactor",
    "src/render",
    "src/scanner",
    "src/verify",
    "scripts/lib/eval-corpus"
  ]) {
    for (const file of javascriptFiles(path.join(repoRoot, directory))) {
      const lineCount = countLines(file);
      assert.ok(
        lineCount <= 250,
        `${path.relative(repoRoot, file)} has ${lineCount} lines`
      );
    }
  }
});

function fixtureCase(labels) {
  return {
    id: "fixture/repo",
    category: "fixture",
    revision: "0".repeat(40),
    labels
  };
}

function fixtureAnalysis({ importantFiles, run = [], test: testCommands = [] }) {
  return {
    state: {
      scan: { complete: true },
      important_files: importantFiles.map((path) => ({ path })),
      commands: {
        run,
        test: testCommands
      }
    }
  };
}

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return javascriptFiles(target);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
  });
}

function countLines(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).length;
}
