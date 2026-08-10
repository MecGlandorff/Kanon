import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  generatedExtensionlessWrappers
} from "../scripts/lib/artifact-files.js";
import {
  FROZEN_DEVELOPMENT_REPORT_SHA256,
  validateMaintainerStableEvidence,
  validateMaintainerStableEvidenceBinding
} from "../scripts/lib/maintainer-stable-release.js";
import { runGit } from "../src/git-runner.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = read(".github/workflows/ci.yml");

test("every history-dependent workflow job checks out full history", () => {
  const jobs = workflowJobs();
  const historyDependentEntrypoints = [
    /npm run validate/u,
    /scripts\/check-candidate\.js/u,
    /scripts\/check-maintainer-evidence\.js/u,
    /npm run eval:release/u,
    /scripts\/release-bind\.js/u
  ];
  const affected = Array.from(jobs)
    .filter(([, body]) =>
      historyDependentEntrypoints.some((pattern) => pattern.test(body))
    )
    .map(([name]) => name)
    .sort();
  assert.deepEqual(affected, [
    "maintainer-stable-evidence",
    "pack-candidate",
    "publish",
    "release-eval",
    "release-gate",
    "test"
  ]);
  for (const name of affected) {
    const body = jobs.get(name);
    const checkouts = Array.from(
      body.matchAll(/^\s*uses: actions\/checkout@[0-9a-f]{40}/gmu)
    );
    const fullHistory = Array.from(
      body.matchAll(/^\s*fetch-depth: 0$/gmu)
    );
    assert.ok(checkouts.length > 0, `${name} must check out the repository`);
    assert.equal(
      fullHistory.length,
      checkouts.length,
      `${name} must use full history for every checkout`
    );
  }
});

test("every generated extensionless wrapper has canonical LF attributes", () => {
  const wrappers = generatedExtensionlessWrappers();
  assert.equal(wrappers.length, 13);
  assert.equal(wrappers[0], "runtime/bin/kanon-dispatch");
  const result = git(["check-attr", "text", "eol", "--", ...wrappers]);
  const attributes = parseAttributes(result);
  for (const wrapper of wrappers) {
    assert.deepEqual(attributes.get(wrapper), {
      eol: "lf",
      text: "set"
    });
    const bytes = fs.readFileSync(path.join(repoRoot, wrapper));
    assert.equal(bytes.includes(13), false, `${wrapper} must contain only LF`);
  }
});

test("CRLF-style wrapper fixtures normalize deterministically to canonical LF", () => {
  const first = crlfFixtureSnapshot();
  const second = crlfFixtureSnapshot();
  assert.deepEqual(first, second);
  for (const relative of generatedExtensionlessWrappers()) {
    assert.equal(first[relative], sha256(fs.readFileSync(path.join(repoRoot, relative))));
  }
});

test("maintainer-stable validates one exact frozen failed development binding", () => {
  const binding = validateMaintainerStableEvidence(repoRoot);
  assert.equal(
    binding.frozen_development.sha256,
    FROZEN_DEVELOPMENT_REPORT_SHA256
  );
  assert.equal(binding.frozen_development.case_count, 30);
  assert.equal(binding.frozen_development.analysis_error_count, 0);
  assert.equal(binding.frozen_development.incomplete_scan_count, 9);
  assert.equal(binding.frozen_development.thresholds_passed, false);
  assert.equal(binding.frozen_development.threshold_failures.length, 7);
  assert.equal(binding.accepted_risks_remain_open, true);
  assert.equal(binding.failed_thresholds_called_passing, false);
  assert.equal(binding.corpus_execution_occurred, false);
  assert.equal(binding.holdout_execution_occurred, false);
  assert.equal(binding.evidence_strict_release_supported, false);
  assert.equal(binding.independence_established, false);
  assert.equal(binding.holdout_performance_established, false);
  assert.deepEqual(
    validateMaintainerStableEvidenceBinding(repoRoot, binding),
    binding
  );
  const changed = structuredClone(binding);
  changed.frozen_development.thresholds_passed = true;
  assert.throws(
    () => validateMaintainerStableEvidenceBinding(repoRoot, changed),
    /frozen-evidence-binding-value/u
  );
});

test("maintainer-stable routes around execution while stable stays strict", () => {
  const development = workflowSection("development-eval", "maintainer-stable-evidence");
  const maintainer = workflowSection("maintainer-stable-evidence", "release-eval");
  const release = workflowSection("release-eval", "release-gate");
  const gate = workflowSection("release-gate", "publish");
  assert.match(development, /inputs\.release_kind != 'maintainer-stable'/u);
  assert.match(development, /npm run eval:dev/u);
  assert.match(development, /--require-threshold-pass/u);
  assert.doesNotMatch(maintainer, /eval:dev|eval:corpus|eval:release/u);
  assert.match(maintainer, /check-maintainer-evidence\.js/u);
  assert.match(maintainer, /without corpus execution/u);
  assert.match(release, /inputs\.release_kind == 'stable'/u);
  assert.match(release, /npm run eval:release/u);
  assert.match(release, /--expected-corpus-sha256/u);
  assert.match(gate, /needs\.maintainer-stable-evidence\.result == 'success'/u);
  assert.match(gate, /Download frozen maintainer evidence binding/u);
  assert.match(gate, /if: inputs\.release_kind != 'maintainer-stable'/u);
});

test("validate-only cannot reach publication, tagging, release, merge, or registry mutation", () => {
  const publish = workflow.slice(workflow.indexOf("\n  publish:"));
  const beforePublish = workflow.slice(0, workflow.indexOf("\n  publish:"));
  assert.match(publish, /inputs\.publish == 'publish'/u);
  assert.match(publish, /needs\.release-gate\.result == 'success'/u);
  assert.doesNotMatch(
    beforePublish,
    /npm publish|gh api|gh release create|refs\/tags\/|registry-url:/u
  );
  assert.doesNotMatch(workflow, /\bgit\s+(?:merge|rebase|push)\b/u);
  assert.equal((workflow.match(/npm publish/gu) || []).length, 1);
  assert.equal((workflow.match(/gh release create/gu) || []).length, 2);
});

test("the workflow packs once and reuses that tarball for assurance", () => {
  const pack = workflowSection("pack-candidate", "cross-platform-conformance");
  const cross = workflowSection("cross-platform-conformance", "development-eval");
  const publish = workflow.slice(workflow.indexOf("\n  publish:"));
  assert.equal((workflow.match(/\bnpm pack\b/gu) || []).length, 1);
  assert.match(pack, /Pack candidate exactly once/u);
  assert.match(pack, /subject-path: \$\{\{ steps\.artifact\.outputs\.tarball \}\}/u);
  assert.match(pack, /Upload exact candidate artifact/u);
  assert.match(cross, /Download exact candidate artifact/u);
  assert.doesNotMatch(cross, /npm pack|build:package/u);
  assert.match(publish, /Download immutable release bundle/u);
  assert.match(publish, /ci-artifact\.js verify/u);
  assert.doesNotMatch(publish, /npm pack|build:package/u);
});

test("PowerShell Node detection accepts only majors 20, 22, 24, and 25 on Unix", (t) => {
  if (process.platform === "win32") {
    t.skip("This regression targets Unix-like PowerShell hosts.");
    return;
  }
  const shell = findPowerShell();
  if (!shell) {
    t.skip("PowerShell is unavailable.");
    return;
  }
  const fixture = makePowerShellFixture();
  try {
    for (const major of [20, 22, 24, 25]) {
      const trusted = path.join(fixture.root, `trusted node ${major}`);
      fs.mkdirSync(trusted);
      writeNodeProbe(path.join(trusted, "node"), `${major}\n`, 0, true);
      const run = runPowerShellDispatch(shell, fixture, trusted);
      assert.equal(run.status, 0, run.stderr || run.stdout);
      assert.equal(run.stdout, "1.0.0\n");
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("PowerShell Node detection fails closed for empty, malformed, unexpected, and unsafe resolution", (t) => {
  if (process.platform === "win32") {
    t.skip("This regression targets Unix-like PowerShell hosts.");
    return;
  }
  const shell = findPowerShell();
  if (!shell) {
    t.skip("PowerShell is unavailable.");
    return;
  }
  const fixture = makePowerShellFixture();
  try {
    const cases = [
      ["empty", "", 0],
      ["malformed", "twenty\n", 0],
      ["unexpected", "21\n", 0],
      ["multiple", "20\n22\n", 0],
      ["failed", "20\n", 97]
    ];
    for (const [name, output, status] of cases) {
      const trusted = path.join(fixture.root, `invalid node ${name}`);
      fs.mkdirSync(trusted);
      const marker = path.join(trusted, "runtime-invoked");
      writeNodeProbe(path.join(trusted, "node"), output, status, false, marker);
      const run = runPowerShellDispatch(shell, fixture, trusted);
      assert.equal(run.status, 127, `${name}: ${run.stderr || run.stdout}`);
      assert.equal(fs.existsSync(marker), false);
    }

    const unsafeMarker = path.join(fixture.repository, "unsafe-node-invoked");
    writeNodeProbe(
      path.join(fixture.repository, "node"),
      "25\n",
      0,
      false,
      unsafeMarker
    );
    const unsafe = runPowerShellDispatch(shell, fixture, fixture.repository);
    assert.equal(unsafe.status, 127, unsafe.stderr || unsafe.stdout);
    assert.equal(fs.existsSync(unsafeMarker), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

function crlfFixtureSnapshot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-crlf-fixture-"));
  try {
    fs.writeFileSync(path.join(root, ".gitattributes"), read(".gitattributes"));
    for (const relative of generatedExtensionlessWrappers()) {
      const destination = path.join(root, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const source = read(relative).replaceAll("\r\n", "\n");
      fs.writeFileSync(destination, source.replaceAll("\n", "\r\n"));
    }
    fixtureGit(root, ["init", "--quiet"]);
    fixtureGit(root, [
      "-c",
      "core.autocrlf=true",
      "-c",
      "core.safecrlf=false",
      "add",
      "--",
      ".gitattributes",
      ...generatedExtensionlessWrappers()
    ]);
    const checked = fixtureGit(root, [
      "check-attr",
      "eol",
      "--",
      ...generatedExtensionlessWrappers()
    ]);
    for (const line of checked.trim().split("\n")) {
      assert.match(line, /: eol: lf$/u);
    }
    return Object.fromEntries(
      generatedExtensionlessWrappers().map((relative) => {
        const bytes = Buffer.from(
          fixtureGit(root, ["show", `:${relative}`], "latin1"),
          "latin1"
        );
        assert.equal(bytes.includes(13), false);
        return [relative, sha256(bytes)];
      })
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function makePowerShellFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanon powershell fixture "));
  const plugin = path.join(root, "plugin path with spaces");
  const repository = path.join(root, "repository path with spaces");
  fs.mkdirSync(plugin);
  fs.mkdirSync(repository);
  fs.cpSync(path.join(repoRoot, "runtime"), path.join(plugin, "runtime"), {
    recursive: true
  });
  return { plugin, repository, root };
}

function runPowerShellDispatch(shell, fixture, nodeDirectory) {
  return spawnSync(
    shell,
    [
      "-NoProfile",
      "-File",
      path.join(fixture.plugin, "runtime", "bin", "kanon-dispatch.ps1"),
      "orient",
      "--version"
    ],
    {
      cwd: fixture.repository,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${nodeDirectory}${path.delimiter}${fixture.repository}`
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30_000,
      windowsHide: true
    }
  );
}

function writeNodeProbe(file, output, probeStatus, delegate, marker = "") {
  const script = `#!/bin/sh
if [ "$1" = "-p" ]; then
  ${output ? `printf %s ${shellQuote(output)}` : ":"}
  exit ${probeStatus}
fi
${delegate
  ? `exec ${shellQuote(process.execPath)} "$@"`
  : `: > ${shellQuote(marker)}\nexit 98`}
`;
  fs.writeFileSync(file, script);
  fs.chmodSync(file, 0o755);
}

function findPowerShell() {
  for (const name of ["pwsh", "powershell.exe"]) {
    for (const entry of String(process.env.PATH || "").split(path.delimiter)) {
      if (!entry) {
        continue;
      }
      const candidate = path.join(entry, name);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return fs.realpathSync(candidate);
      } catch {
        // Continue through the bounded executable search path.
      }
    }
  }
  return null;
}

function parseAttributes(output) {
  const result = new Map();
  for (const line of output.trim().split("\n")) {
    const match = line.match(/^(.*): (text|eol): (.*)$/u);
    assert.ok(match, `Unexpected git check-attr output: ${line}`);
    const current = result.get(match[1]) || {};
    current[match[2]] = match[3];
    result.set(match[1], current);
  }
  return result;
}

function workflowJobs() {
  const starts = Array.from(
    workflow.matchAll(/^  ([a-z][a-z0-9-]*):$/gmu)
  );
  return new Map(starts.map((match, index) => [
    match[1],
    workflow.slice(
      match.index,
      starts[index + 1]?.index ?? workflow.length
    )
  ]));
}

function workflowSection(start, end) {
  const jobs = workflowJobs();
  const body = jobs.get(start);
  assert.ok(body, `Missing workflow job ${start}`);
  assert.ok(jobs.has(end), `Missing workflow boundary ${end}`);
  return body;
}

function fixtureGit(root, args, encoding = "utf8") {
  const result = runGit(root, args, {
    encoding,
    maxOutputBytes: 8 * 1024 * 1024,
    timeoutMs: 10_000
  });
  assert.equal(result.ok, true, `${args[0]}: ${result.diagnostic}`);
  return result.stdout;
}

function git(args) {
  const result = runGit(repoRoot, args, {
    maxOutputBytes: 8 * 1024 * 1024,
    timeoutMs: 10_000
  });
  assert.equal(result.ok, true, `${args[0]}: ${result.diagnostic}`);
  return result.stdout;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function read(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), "utf8");
}
