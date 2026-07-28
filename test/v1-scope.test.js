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
const design = fs.readFileSync(
  path.join(repoRoot, "V_1design.md"),
  "utf8"
);
const runB = fs.readFileSync(
  path.join(repoRoot, "docs", "v1-run-b.md"),
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
    /initial scope freeze deliberately selected no Guard mode for either host/
  );
  assert.match(
    scope,
    /additive Run B decision below supersedes that open question with\s+independent notice-only decisions/
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
    /classifies context and\s+available receipt data as Current, Stale, or Unknown; it does not\s+automatically intercept host operations or enforce mutation blocking/
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

test("authorized recovery amendment makes lifecycle notice explicit-only", () => {
  assert.match(scope, /Run B recovery lifecycle-notice amendment/);
  assert.match(scope, /Decision date:\*\* 2026-07-28/);
  assert.match(
    scope,
    /Lifecycle-hook declarations are now\s+host-specific and optional/
  );
  assert.match(
    scope,
    /Stable notice is delivered only through explicit skill and status output/
  );
  assert.match(
    scope,
    /contains no production `PreToolUse` hook, shared hook manifest,\s+shell command, or PATH-dependent lifecycle launcher/
  );
  assert.match(scope, /lifecycle notice is reported as unavailable/);
  assert.match(scope, /host hook introspection\s+remains `Unknown`/);
  assert.match(scope, /hostile-environment boundary/);
  assert.match(
    scope,
    /Automatic lifecycle notice and hard Guard remain future,\s+host-specific experimental work/
  );
});

test("authoritative design and Run B record visibly supersede the reopened P1", () => {
  assert.match(design, /Authorized lifecycle-notice amendment/);
  assert.match(design, /\*\*Decision date:\*\* 2026-07-28/);
  assert.match(
    design,
    /Lifecycle-hook declarations are host-specific and optional/
  );
  assert.match(
    design,
    /stable v1 artifact contains none/
  );
  assert.doesNotMatch(
    design,
    /Use the default `hooks\/hooks\.json` location supported by both hosts/
  );
  assert.match(
    design,
    /\| Codex CLI \| All six v1 skills \| Explicit skill\/status `notice`; enforcement false; no lifecycle hook \|/
  );
  assert.match(runB, /Recovery amendment frame/);
  assert.match(runB, /commit `be0427e` reopened one slice-4 P1/);
  assert.match(
    runB,
    /pre-recovery statements below saying “P0\/P1 at completion: none,”[\s\S]*?\*\*Stale \/ suspicious\*\*/
  );
});
