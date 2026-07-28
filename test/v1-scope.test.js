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
const runC = fs.readFileSync(
  path.join(repoRoot, "docs", "v1-run-c.md"),
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
  assert.match(runB, /Recovery certification — slices 4 through 8/);
  assert.match(runB, /sole current Run B acceptance record/);
  assert.match(runB, /124 tests,\s+123 passed,\s+1 skipped[\s\S]*?0 failed/);
  assert.match(runB, /184 tests:\s+182 passed,\s+2 platform proofs skipped/);
  assert.match(runB, /passed 33 of 33\s+installed-artifact checks/);
  assert.match(runB, /artifact contains no `hooks\/` tree/);
  assert.match(runB, /\*\*Remaining P0\/P1:\*\* none/);
  assert.match(
    runB,
    /defer slice 9 entirely or to authorize a narrow contract amendment for a\s+receipt-only, non-enforcing lifecycle/
  );
});

test("authorized Run C amendment separates advisory receipts from Guard", () => {
  const feasibility = fs.readFileSync(
    path.join(repoRoot, "docs", "v1-guard-feasibility.md"),
    "utf8"
  );
  assert.match(design, /Authorized receipt-only amendment/);
  assert.match(
    design,
    /may persist versioned receipts only in hardened plugin data outside\s+the inspected repository/
  );
  assert.match(
    design,
    /may evaluate them only during an explicit Kanon\s+invocation/
  );
  assert.match(
    design,
    /never blocks, approves, authorizes, intercepts,\s+denies, rewrites, or permits mutation/
  );
  assert.match(
    design,
    /Unavailable session, compaction,\s+lifecycle, or host evidence remains `Unknown`/
  );
  assert.match(
    design,
    /Implement the bounded receipt-only, non-enforcing lifecycle authorized by/
  );
  assert.match(scope, /Run C receipt-only amendment/);
  assert.match(
    scope,
    /never falls back to repository files or undocumented host state/
  );
  assert.match(feasibility, /Run C receipt-only product amendment/);
  assert.match(
    feasibility,
    /leaves both hard-Guard decisions at no-go/
  );
  assert.match(runB, /Run C authorization postscript/);
  assert.match(
    runB,
    /does not rewrite Run B evidence or claim Run C completion/
  );
  for (const text of [design, scope, feasibility, runB]) {
    assert.doesNotMatch(
      text,
      /receipt-only[^.\n]*(?:blocks?|approves?|authorizes?|denies?|rewrites?) mutation/i
    );
  }
});

test("Run C slice 9 record keeps receipt persistence bounded and non-enforcing", () => {
  assert.match(scope, /Run C slice 9 implementation status/);
  assert.match(runC, /kanon-context-receipt-v2/);
  assert.match(runC, /kanon-context-receipt-store-v1/);
  assert.match(runC, /capped at 16 KiB, eight\s+unique repository-root records, and 30 days/);
  assert.match(
    runC,
    /Actual host persistence and `Current`\s+classification therefore remain `Unknown`/
  );
  assert.match(runC, /no production lifecycle hook/);
  assert.match(runC, /No P0 or P1\s+remains for this slice/);
  assert.doesNotMatch(
    runC,
    /receipt[^.\n]*(?:authorizes?|approves?|permits?|blocks?) mutation/i
  );
});

test("Run C slice 10 exposes only thin non-orchestrating steer", () => {
  assert.match(scope, /Run C slice 10 implementation status/);
  assert.match(
    scope,
    /This slice did not implement `aswitch`, terminal launch, or full-history/
  );
  assert.match(runC, /Slice 10 — thin steer/);
  assert.match(runC, /kanon-steer-request-v1/);
  assert.match(runC, /kanon-steer-state-v1/);
  assert.match(runC, /`authorization` is always false/);
  assert.match(runC, /completion is always\s+`NotClaimed`/);
  assert.match(
    runC,
    /does not execute a plan step, repository code, or verification/
  );
  assert.match(runC, /No P0 or P1 remains for slice 10/);
  assert.doesNotMatch(
    runC,
    /steer[^.\n]*(?:orchestrates?|manages? agents?|claims? completion)/i
  );
});

test("Run C slice 11 exposes consented handoff without launch or ownership", () => {
  assert.match(scope, /Run C slice 11 implementation status/);
  assert.match(
    scope,
    /offers\s+exactly Last plan, Compacted structured handoff, and experimental Full-history/
  );
  assert.match(scope, /Last plan is the default/);
  assert.match(scope, /kanon-aswitch-approval-v1/);
  assert.match(scope, /capped at eight Kanon handoffs and 256 inspected entries/);
  assert.match(
    scope,
    /checks the exact schema, semantic checksum,\s+content-derived filename, canonical repository root, recorded commit,\s+complete normalized Git change-set fingerprint, and target host/
  );
  assert.match(scope, /directly\s+observed mismatch is `Stale`/);
  assert.match(scope, /unavailable comparison remains `Unknown`/);
  assert.match(scope, /No executable is resolved or launched in slice 11/);
  assert.match(
    scope,
    /argument contains only a fixed bootstrap plus the safe handoff\s+path, never raw handoff content/
  );
  assert.match(runC, /Slice 11 — consent-driven aswitch handoff/);
  assert.match(runC, /kanon-aswitch-preview-v1/);
  assert.match(runC, /kanon-agent-handoff-v1/);
  assert.match(runC, /No P0 or P1 remains for slice 11/);
  assert.doesNotMatch(
    runC,
    /aswitch[^.\n]*(?:automatically launches|claims repository ownership|grants execution authority)/i
  );
});
