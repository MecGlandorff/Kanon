import assert from "node:assert/strict";
import test from "node:test";
import { rankImportantFiles } from "../src/code-intel/rank.js";

const DECLARATION = Object.freeze({
  type: "declaration",
  source: "manifest",
  confidence: "known",
  score: 96,
  reason: "declared package export"
});
const DECLARED_EXECUTABLE = Object.freeze({
  type: "entrypoint",
  source: "manifest",
  confidence: "known",
  score: 110,
  reason: "declared package binary"
});
const EXECUTABLE_SYNTAX = Object.freeze({
  type: "entrypoint",
  confidence: "known",
  score: 75,
  reason: "executable Node script"
});

test("withdrawal restores pre-correction package declaration admission", () => {
  const output = rank([
    file("README.md"),
    file("package.json"),
    file("modules/public.js", { signals: [DECLARATION] })
  ]);

  assert.deepEqual(selectedPaths(output), [
    "README.md",
    "package.json",
    "modules/public.js"
  ]);
  const declaration = byPath(output, "modules/public.js");
  assert.equal(declaration.recommended, true);
  assert.equal(
    declaration.selection_heuristic,
    "manifest-entrypoint"
  );
  assert.equal(
    declaration.selection_reason,
    "manifest-declared package target"
  );
});

test("package declarations retain independently salient targets", () => {
  const output = rank([
    file("README.md"),
    file("package.json"),
    file("lib/imported.js", {
      signals: [DECLARATION],
      fanIn: 2
    }),
    file("lib/referenced.js", {
      signals: [DECLARATION],
      referencedBy: 1
    }),
    file("bin/tool.js", {
      signals: [DECLARATION, EXECUTABLE_SYNTAX]
    })
  ]);

  assert.deepEqual(new Set(selectedPaths(output)), new Set([
    "README.md",
    "package.json",
    "lib/imported.js",
    "lib/referenced.js",
    "bin/tool.js"
  ]));
  for (const [target, reason] of [
    ["lib/imported.js", "manifest-declared package target"],
    ["lib/referenced.js", "manifest-declared package target"],
    ["bin/tool.js", "manifest-declared executable"]
  ]) {
    const item = byPath(output, target);
    assert.equal(item.recommended, true);
    assert.equal(item.selection_reason, reason);
  }
});

test("executable manifest-entrypoints controls remain unchanged", () => {
  /** @type {Record<string, unknown>[]} */
  const events = [];
  const output = rank([
    file("README.md"),
    file("package.json"),
    file("cli/start.js", { signals: [DECLARED_EXECUTABLE] }),
    file("lib/declaration.js", { signals: [DECLARATION] })
  ], (event) => events.push(event));
  const control = byPath(output, "cli/start.js");

  assert.equal(control.recommended, true);
  assert.equal(control.selection_heuristic, "manifest-entrypoint");
  assert.equal(
    control.selection_reason,
    "manifest-declared executable"
  );
  assert.ok(events.some(
    (event) =>
      event.type === "curation-decision" &&
      event.stage === "manifest-entrypoints" &&
      event.path === "cli/start.js" &&
      event.decision === "selected"
  ));
});

test("trace-on and trace-off public ranking results are exactly equal", () => {
  const fixture = [
    file("README.md"),
    file("package.json"),
    file("cli/run.js", { signals: [DECLARED_EXECUTABLE] }),
    file("lib/declaration.js", { signals: [DECLARATION] }),
    file("lib/shared.js", {
      signals: [DECLARATION],
      fanIn: 1
    })
  ];
  /** @type {Record<string, unknown>[]} */
  const events = [];
  const withoutTrace = rank(fixture);
  const withTrace = rank(fixture, (event) => events.push(event));
  const withFailingTrace = rank(fixture, () => {
    throw new Error("synthetic observer failure");
  });

  assert.deepEqual(withTrace, withoutTrace);
  assert.deepEqual(withFailingTrace, withoutTrace);
  assert.ok(events.length > 0);
});

function file(path, options = {}) {
  return {
    path,
    text: true,
    signals: options.signals || [],
    fanIn: options.fanIn || 0,
    referencedBy: options.referencedBy || 0
  };
}

function rank(fixture, observer) {
  const signals = new Map(
    fixture
      .filter((item) => item.signals.length > 0)
      .map((item) => [item.path, item.signals])
  );
  const importers = new Map(
    fixture
      .filter((item) => item.fanIn > 0)
      .map((item) => [
        item.path,
        new Set(
          Array.from(
            { length: item.fanIn },
            (_, index) => `importer-${index}.js`
          )
        )
      ])
  );
  const references = new Map(
    fixture
      .filter((item) => item.referencedBy > 0)
      .map((item) => [
        item.path,
        new Set(
          Array.from(
            { length: item.referencedBy },
            (_, index) => `reference-${index}.js`
          )
        )
      ])
  );
  return rankImportantFiles(
    fixture.map((item) => ({ path: item.path, text: item.text })),
    { signals, importers, references },
    observer ? { observer } : {}
  );
}

function selectedPaths(output) {
  return output
    .filter((item) => item.recommended)
    .map((item) => item.path);
}

function byPath(output, path) {
  const item = output.find((candidate) => candidate.path === path);
  assert.ok(item, `missing candidate ${path}`);
  return item;
}
