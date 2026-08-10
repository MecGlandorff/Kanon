import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  analyzeRepo,
  buildContinuityArtifactMetadata,
  buildContinuityReport,
  inspectPreviousHandoff,
  inspectPreviousState
} from "../src/index.js";
import { runCli } from "../src/cli.js";
import {
  canSymlink,
  captureCli,
  makeFixture,
  writeFixtureFile
} from "./helpers.js";

const NOW = Date.parse("2026-07-27T12:00:00.000Z");

test("continuity report classifies bounded high-signal live evidence", () => {
  const root = makeFixture();
  const current = continuityState(root, {
    fingerprints: [
      fingerprint("AGENTS.md", "a"),
      fingerprint("README.md", "b"),
      fingerprint("docs/architecture.md", "c"),
      fingerprint("reports/latest.json", "d"),
      fingerprint("src/index.js", "e")
    ],
    recentCommits: [
      {
        hash: "abcdef123456",
        date: "2026-07-27",
        subject: "safe\u001b[2J \u202ecommit"
      },
      {
        hash: "not-a-hash",
        date: "tomorrow",
        subject: "discard me"
      }
    ]
  });

  const report = buildContinuityReport({
    artifact_metadata: buildContinuityArtifactMetadata({
      files: [
        {
          path: "reports/latest.json",
          mtime_ms: NOW - 60_000
        }
      ]
    }),
    current,
    handoff: {
      found: true,
      valid: true,
      status: "available",
      bytes: 128
    },
    now: NOW
  });

  assert.equal(report.ok, true);
  assert.equal(report.schema, "kanon-continuity-report-v1");
  assert.equal(report.authority, "live");
  assert.equal(report.read_only, true);
  assert.equal(report.trust, "repository-untrusted");
  assert.deepEqual(report.sources.instructions, {
    status: "Known",
    paths: ["AGENTS.md"]
  });
  assert.deepEqual(report.sources.documentation, {
    status: "Known",
    paths: ["README.md", "docs/architecture.md"]
  });
  assert.deepEqual(report.sources.artifacts, {
    status: "Known",
    paths: ["reports/latest.json"]
  });
  assert.deepEqual(report.sources.recent_artifacts, {
    status: "Known",
    paths: ["reports/latest.json"]
  });
  assert.equal(report.sources.checkpoint.status, "Unknown");
  assert.equal(report.sources.handoff.status, "Known");
  assert.deepEqual(report.recent_commits, [
    {
      hash: "abcdef123456",
      date: "2026-07-27",
      subject: "safe commit",
      trust: "repository-untrusted"
    }
  ]);
  assert.doesNotMatch(JSON.stringify(report), /\u001b|\u202e/);
});

test("live state wins and differences remain separately classified", () => {
  const root = makeFixture();
  const current = continuityState(root, {
    branch: "release/v.1.0.0",
    fingerprints: [
      fingerprint("README.md", "a"),
      fingerprint("src/new.js", "b")
    ],
    head: "abcdef123456",
    purpose: "Live purpose",
    recentCommits: [
      {
        hash: "abcdef123456",
        date: "2026-07-27",
        subject: "live commit"
      }
    ]
  });
  const previous = continuityState(root, {
    branch: "old-branch",
    fingerprints: [
      fingerprint("README.md", "c"),
      fingerprint("src/gone.js", "d")
    ],
    generatedAt: "2026-07-26T12:00:00.000Z",
    head: "123456abcdef",
    purpose: "Stored purpose",
    recentCommits: [
      {
        hash: "123456abcdef",
        date: "2026-07-26",
        subject: "stored commit"
      }
    ]
  });

  const report = buildContinuityReport({
    current,
    previous,
    now: NOW
  });

  assert.equal(report.ok, true);
  assert.equal(report.repository_root, root);
  assert.equal(report.sources.checkpoint.status, "Known");
  assert.deepEqual(
    report.observations.added.map((item) => item.path),
    ["src/new.js"]
  );
  assert.deepEqual(
    report.observations.changed.map((item) => item.path),
    ["README.md"]
  );
  assert.ok(
    report.observations.contradicted.some(
      (item) => item.path === "src/gone.js"
    )
  );
  assert.ok(
    report.observations.contradicted.some(
      (item) => /stored purpose claim/.test(item.claim)
    )
  );
  assert.ok(
    report.observations.stale.some(
      (item) => /Git HEAD/.test(item.claim)
    )
  );
  assert.ok(
    report.observations.stale.some(
      (item) => /checkpoint branch/.test(item.claim)
    )
  );
  assert.equal(report.recent_commits[0].subject, "live commit");
  assert.doesNotMatch(JSON.stringify(report), /stored commit/);
});

test("incomplete live evidence prevents absence conclusions", () => {
  const root = makeFixture();
  const current = continuityState(root, {
    fingerprints: [fingerprint("README.md", "a")],
    scanComplete: false,
    scanLimits: ["max_files"]
  });
  const previous = continuityState(root, {
    fingerprints: [
      fingerprint("README.md", "a"),
      fingerprint("src/not-observed.js", "b")
    ]
  });

  const report = buildContinuityReport({
    current,
    previous,
    now: NOW
  });

  assert.equal(report.ok, true);
  assert.equal(report.sources.instructions.status, "Unknown");
  assert.equal(report.sources.documentation.status, "Unknown");
  assert.equal(report.sources.artifacts.status, "Unknown");
  assert.equal(report.sources.recent_artifacts.status, "Unknown");
  assert.equal(
    report.observations.contradicted.some(
      (item) => item.path === "src/not-observed.js"
    ),
    false
  );
  assert.ok(
    report.observations.unavailable.some(
      (item) =>
        item.path === "src/not-observed.js" &&
        /incomplete live evidence/.test(item.claim)
    )
  );
});

test("stale checkpoints and unavailable fingerprints stay explicit", () => {
  const root = makeFixture();
  const current = continuityState(root, {
    fingerprints: [
      {
        path: "README.md",
        size: 10,
        sha256: null
      }
    ]
  });
  const previous = continuityState(root, {
    fingerprints: [fingerprint("README.md", "a")],
    generatedAt: "2026-05-01T00:00:00.000Z"
  });

  const report = buildContinuityReport({
    current,
    previous,
    now: NOW
  });

  assert.equal(report.ok, true);
  assert.ok(
    report.observations.stale.some(
      (item) => /staleness bound/.test(item.claim)
    )
  );
  assert.ok(
    report.observations.unavailable.some(
      (item) =>
        item.path === "README.md" &&
        /fingerprint was unavailable/.test(item.claim)
    )
  );
});

test("malformed stored state recovers without weakening live evidence", () => {
  const root = makeFixture();
  const current = continuityState(root);
  const malformed = {
    repo: { root },
    generated_at: "not-a-date",
    files: { fingerprints: "not-an-array" }
  };

  const report = buildContinuityReport({
    current,
    previous: malformed,
    previous_warning: "state changed\u001b[2J after containment validation",
    now: NOW
  });

  assert.equal(report.ok, true);
  assert.equal(report.authority, "live");
  assert.equal(report.sources.checkpoint.status, "Unknown");
  assert.ok(
    report.observations.unavailable.some(
      (item) => /Prior continuity state/.test(item.claim)
    )
  );
  assert.deepEqual(report.diagnostics, [
    "state changed after containment validation"
  ]);

  for (const invalid of [
    null,
    { current, unexpected: true },
    {
      current: continuityState(root, {
        fingerprints: [fingerprint("../escape", "a")]
      })
    },
    {
      current: continuityState(root, {
        fingerprints: [fingerprint("src/\u202eattack.js", "a")]
      })
    }
  ]) {
    const unknown = buildContinuityReport(invalid);
    assert.equal(unknown.ok, false);
    assert.equal(unknown.status, "Unknown");
    assert.deepEqual(unknown.observations.added, []);
  }
});

test("continuity input and output budgets are enforced deterministically", () => {
  const root = makeFixture();
  const currentFingerprints = Array.from(
    { length: 80 },
    (_unused, index) =>
      fingerprint(`new/file-${index}.js`, hexDigit(index))
  );
  const previousFingerprints = Array.from(
    { length: 80 },
    (_unused, index) =>
      fingerprint(`old/file-${index}.js`, hexDigit(index + 1))
  );
  const bounded = buildContinuityReport({
    current: continuityState(root, {
      fingerprints: currentFingerprints
    }),
    previous: continuityState(root, {
      fingerprints: previousFingerprints
    }),
    now: NOW
  });

  assert.equal(bounded.ok, true);
  for (const category of Object.values(bounded.observations)) {
    assert.ok(category.length <= 32);
  }
  assert.ok(bounded.diagnostics.length <= 16);

  const oversized = buildContinuityReport({
    current: continuityState(root, {
      fingerprints: Array.from(
        { length: 5_001 },
        (_unused, index) =>
          fingerprint(`src/file-${index}.js`, hexDigit(index))
      )
    }),
    now: NOW
  });

  assert.equal(oversized.ok, true);
  assert.equal(oversized.sources.documentation.status, "Unknown");
  assert.ok(
    oversized.observations.unavailable.some(
      (item) => /fingerprint set exceeded/.test(item.claim)
    )
  );
  assert.equal(oversized.limits.max_fingerprints, 5_000);

  const malformedMetadata = buildContinuityArtifactMetadata({
    files: [{ path: "../outside", mtime_ms: NOW }]
  });
  assert.equal(malformedMetadata.ok, false);
  const duplicateMetadata = buildContinuityArtifactMetadata({
    files: [
      { path: "reports/result.json", mtime_ms: NOW },
      { path: "reports/result.json", mtime_ms: NOW - 1 }
    ]
  });
  assert.equal(duplicateMetadata.ok, false);
});

test("handoff inspection is contained, bounded, and schema-aware", (t) => {
  const missingRoot = makeFixture();
  assert.deepEqual(inspectPreviousHandoff(missingRoot), {
    handoff: {
      found: false,
      valid: true,
      status: "missing",
      bytes: 0
    },
    warning: null
  });

  const validRoot = makeFixture({
    ".kanon/HANDOFF.md": "# Resume This Repo\n\nKnown state.\n"
  });
  assert.equal(
    inspectPreviousHandoff(validRoot).handoff.status,
    "available"
  );

  const malformedRoot = makeFixture({
    ".kanon/HANDOFF.md": "# User-owned notes\n"
  });
  assert.equal(
    inspectPreviousHandoff(malformedRoot).handoff.status,
    "malformed"
  );
  assert.match(inspectPreviousHandoff(malformedRoot).warning, /ignored/);

  const oversizedRoot = makeFixture({
    ".kanon/HANDOFF.md": "# Resume This Repo\n\n" + "x".repeat(128)
  });
  assert.equal(
    inspectPreviousHandoff(oversizedRoot, { maxBytes: 32 }).handoff.status,
    "budget-exceeded"
  );
  assert.equal(
    inspectPreviousHandoff(oversizedRoot, { maxBytes: 0 }).handoff.status,
    "invalid-options"
  );

  if (!canSymlink()) {
    t.diagnostic("Symbolic links are unavailable; link case skipped.");
    return;
  }
  const linkedRoot = makeFixture();
  const outside = makeFixture({
    "HANDOFF.md": "# Resume This Repo\n\nOUTSIDE INJECTION\n",
    "STATE.json":
      "{\"schema_version\":1,\"repo\":{\"root\":\"OUTSIDE\"}}\n"
  }, "kanon-continuity-outside-");
  fs.mkdirSync(path.join(linkedRoot, ".kanon"));
  fs.symlinkSync(
    path.join(outside, "HANDOFF.md"),
    path.join(linkedRoot, ".kanon", "HANDOFF.md"),
    "file"
  );
  fs.symlinkSync(
    path.join(outside, "STATE.json"),
    path.join(linkedRoot, ".kanon", "STATE.json"),
    "file"
  );
  const linked = inspectPreviousHandoff(linkedRoot);
  const linkedState = inspectPreviousState(linkedRoot);
  assert.equal(linked.handoff.status, "rejected");
  assert.equal(linkedState.valid, false);
  assert.equal(linkedState.state, null);
  assert.doesNotMatch(linked.warning, /OUTSIDE INJECTION/);
  assert.doesNotMatch(linkedState.warning, /OUTSIDE/);
});

test("handoff and concurrency residuals become Unknown observations", () => {
  const root = makeFixture();
  const report = buildContinuityReport({
    current: continuityState(root),
    handoff: {
      found: true,
      valid: false,
      status: "rejected",
      bytes: 0
    },
    previous_warning:
      "STATE.json changed after containment validation.",
    now: NOW
  });

  assert.equal(report.ok, true);
  assert.equal(report.sources.handoff.status, "Unknown");
  assert.ok(
    report.observations.unavailable.some(
      (item) => /No valid prior Kanon handoff/.test(item.claim)
    )
  );
  assert.deepEqual(report.diagnostics, [
    "STATE.json changed after containment validation."
  ]);
});

test("malformed and oversized persisted checkpoints warn and recover", () => {
  const malformedRoot = makeFixture({
    ".kanon/STATE.json": "{\"schema_version\":2,\"repo\":false}\n"
  });
  const malformed = inspectPreviousState(malformedRoot);
  assert.equal(malformed.valid, false);
  assert.equal(malformed.state, null);
  assert.match(malformed.warning, /ignored/);

  const oversizedRoot = makeFixture({
    ".kanon/STATE.json": " ".repeat(2_048)
  });
  const oversized = inspectPreviousState(oversizedRoot, {
    maxBytes: 1_024
  });
  assert.equal(oversized.valid, false);
  assert.equal(oversized.state, null);
  assert.match(oversized.warning, /budget-exceeded/);

  const unsupportedRoot = makeFixture({
    ".kanon/STATE.json":
      "{\"schema_version\":999,\"repo\":{}}\n"
  });
  const unsupported = inspectPreviousState(unsupportedRoot);
  assert.equal(unsupported.valid, false);
  assert.equal(unsupported.state, null);
  assert.match(unsupported.warning, /supported version/);
});

test("read-only resume leaves every repository byte unchanged", async () => {
  const root = makeFixture({
    "AGENTS.md": "# Repository instructions\n",
    "README.md": "# Demo continuity\n",
    ".kanon/HANDOFF.md": "# Resume This Repo\n\nPrior handoff.\n",
    ".kanon/TODO.md": "# Kanon TODO\n\n- [ ] Review state\n"
  });
  const previous = analyzeRepo(root, { inspectGit: false }).state;
  writeFixtureFile(
    root,
    ".kanon/STATE.json",
    `${JSON.stringify(previous, null, 2)}\n`
  );
  const before = snapshotTree(root);

  const output = JSON.parse(
    await captureCli(runCli, ["resume", "--json", "--root", root])
  );

  assert.equal(output.continuity.schema, "kanon-continuity-report-v1");
  assert.equal(output.continuity.read_only, true);
  assert.equal(output.continuity.authority, "live");
  assert.deepEqual(snapshotTree(root), before);
});

function continuityState(root, options = {}) {
  return {
    generated_at:
      options.generatedAt || "2026-07-27T11:00:00.000Z",
    repo: { root },
    scan: {
      complete: options.scanComplete ?? true,
      budgets_reached: options.scanLimits || []
    },
    files: {
      fingerprints:
        options.fingerprints || [fingerprint("README.md", "a")]
    },
    git: {
      found: true,
      observation_complete: true,
      branch: options.branch || "release/v.1.0.0",
      head: options.head || "abcdef123456",
      recent_commits: options.recentCommits || []
    },
    purpose: {
      claim: options.purpose || "Live repository purpose"
    },
    verification: {
      issues: options.verificationIssues || []
    }
  };
}

function fingerprint(relativePath, digit) {
  return {
    path: relativePath,
    size: 10,
    sha256: digit.repeat(64)
  };
}

function hexDigit(index) {
  return "abcdef0123456789"[index % 16];
}

function snapshotTree(root) {
  const entries = [];
  visit(root, "");
  return entries;

  function visit(directory, relativeDirectory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const relative = relativeDirectory
        ? `${relativeDirectory}/${name}`
        : name;
      const absolute = path.join(directory, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) {
        entries.push({ path: relative, type: "directory", mode: stat.mode });
        visit(absolute, relative);
      } else if (stat.isSymbolicLink()) {
        entries.push({
          path: relative,
          type: "link",
          target: fs.readlinkSync(absolute)
        });
      } else {
        entries.push({
          path: relative,
          type: "file",
          mode: stat.mode,
          contents: fs.readFileSync(absolute).toString("base64")
        });
      }
    }
  }
}
