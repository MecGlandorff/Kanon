import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const scope = fs.readFileSync(
  path.join(repoRoot, "docs", "v1-scope.md"),
  "utf8"
);

test("v1 scope freeze names the complete stable skill surface", () => {
  for (const skill of [
    "orient",
    "resume",
    "verify",
    "status",
    "steer",
    "aswitch"
  ]) {
    assert.match(scope, new RegExp("\\$kanon:" + skill));
  }
  assert.match(scope, /Codex CLI and Claude Code CLI/);
});

test("v1 compatibility freeze preserves every v0.4 workflow mapping", () => {
  for (const workflow of [
    "brief",
    "ask",
    "resume",
    "refresh",
    "todo",
    "verify"
  ]) {
    assert.match(scope, new RegExp("`" + workflow + "`"));
  }
  assert.match(
    scope,
    /\| narrow `ask` \| `\$kanon:orient` or `\$kanon:verify` \|/
  );
  assert.match(scope, /`refresh` \| Explicit continuity write/);
  assert.match(scope, /`todo` \| Explicit continuity note/);
});

test("v1 scope preserves the historical gate and records the Run B decision", () => {
  assert.match(
    scope,
    /deliberately selects no Guard mode for either host/
  );
  assert.match(
    scope,
    /neither a `guard` nor a\s+`notice` runtime claim/
  );
  assert.match(
    scope,
    /A result from one host is never evidence for the\s+other/
  );
  assert.match(scope, /Run B notice-mode decision/);
  assert.match(scope, /\| Codex CLI \| `notice` \| `false` \|/);
  assert.match(scope, /\| Claude Code CLI \| `notice` \| `false` \|/);
  assert.match(
    scope,
    /surfaces whether context and the available receipt data\s+are current; it does not enforce mutation blocking/
  );
  assert.match(scope, /unobservable hook state remains `Unknown`/);
  assert.match(
    scope,
    /Hard Guard remains future experimental work outside the public v1 capability\s+contract/
  );
  assert.match(
    scope,
    /six-skill stable target and dual-host support are unchanged/
  );
  assert.doesNotMatch(
    scope,
    /notice[^.\n]*(?:denies?|rewrites?|auto-approves?|blocks?) a host operation/i
  );
});
