import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as claudeAdapter from "../src/v1/adapters/claude.js";
import * as codexAdapter from "../src/v1/adapters/codex.js";
import {
  readEmbeddedBuildMetadata,
  validateEmbeddedBuildMetadata
} from "../runtime/core/build-metadata.js";
import { publicSkillFiles } from "../scripts/lib/artifact-files.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const packageManifest = readJson("package.json");
const codexManifest = readJson(".codex-plugin/plugin.json");
const claudeManifest = readJson(".claude-plugin/plugin.json");
const buildMetadata = readJson("runtime/build-metadata.json");

test("dual-host manifests are separate and share skills plus one runtime root", () => {
  assert.equal(codexManifest.name, "kanon");
  assert.equal(claudeManifest.name, "kanon");
  assert.equal(codexManifest.version, packageManifest.version);
  assert.equal(claudeManifest.version, packageManifest.version);
  assert.equal(codexManifest.skills, "./skills/");
  assert.equal(claudeManifest.skills, "./skills/");
  assert.match(codexManifest.description, /explicit advisory status/);
  assert.match(claudeManifest.description, /explicit advisory status/);
  assert.match(
    codexManifest.interface.longDescription,
    /explicit output[\s\S]*no lifecycle hook/
  );
  assert.notEqual(
    path.join(repoRoot, ".codex-plugin", "plugin.json"),
    path.join(repoRoot, ".claude-plugin", "plugin.json")
  );
  assert.equal(readJson("runtime/package.json").type, "module");
  assert.deepEqual(readJson("runtime/package.json").imports, {
    "#kanon-continuity": "./src/continuity/engine.js",
    "#kanon-repository-inspect": "./repository/inspect.js",
    "#kanon-repository-read": "./repository/read.js"
  });
  assert.equal(fs.existsSync(path.join(repoRoot, "skills", "kanon", "runtime")), false);
  assert.equal(
    fs.existsSync(path.join(repoRoot, "runtime", "bin", "kanon-write.js")),
    true
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, "runtime", "bin", "kanon.js")),
    false
  );
  assert.equal(fs.existsSync(path.join(repoRoot, "runtime", "bin", "kanon-v1.js")), true);
  assert.equal(
    fs.existsSync(path.join(repoRoot, "runtime", "bin", "kanon-dispatch")),
    true
  );
  assert.equal(
    fs.existsSync(
      path.join(repoRoot, "runtime", "bin", "kanon-dispatch.ps1")
    ),
    true
  );
});

test("embedded metadata exposes only accurate notice-mode capabilities", () => {
  const validated = validateEmbeddedBuildMetadata(buildMetadata);
  assert.equal(validated.ok, true);
  assert.deepEqual(buildMetadata.public_capabilities.skills, [
    "kanon",
    "orient",
    "resume",
    "status",
    "verify",
    "steer",
    "aswitch"
  ]);
  assert.equal(buildMetadata.package_name, packageManifest.name);
  assert.equal(buildMetadata.package_version, packageManifest.version);
  assert.deepEqual(
    buildMetadata.public_capabilities.hosts,
    {
      "codex-cli": {
        mode: "notice",
        enforcement: false,
        hook_status: "Unknown",
        lifecycle_notice_hook: "Unavailable",
        notice_delivery: "explicit-skill-and-status-output"
      },
      "claude-code": {
        mode: "notice",
        enforcement: false,
        hook_status: "Unknown",
        lifecycle_notice_hook: "Unavailable",
        notice_delivery: "explicit-skill-and-status-output"
      }
    }
  );
  assert.deepEqual(
    buildMetadata.public_capabilities.notice,
    {
      advisory: true,
      automatic: false,
      blocks: false,
      rewrites: false,
      approves: false,
      suppresses: false,
      forces_reading: false,
      claims_understanding: false,
      delivery: "explicit-skill-and-status-output",
      future_requirement:
        "host-and-platform-specific-proven-executable-argument-vector-and-environment-boundary"
    }
  );
  assert.deepEqual(
    buildMetadata.public_capabilities.receipts,
    {
      role: "advisory-continuity-evidence",
      enforcement: false,
      evaluation: "explicit-kanon-invocation-only",
      persistence: "validated-plugin-data-when-available",
      repository_fallback: false,
      unavailable_host_evidence: "Unknown"
    }
  );
  const read = readEmbeddedBuildMetadata();
  assert.equal(read.ok, true);
  for (const skill of [
    "orient",
    "resume",
    "status",
    "verify",
    "steer",
    "aswitch"
  ]) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, "skills", skill, "SKILL.md")),
      true
    );
  }
  assert.deepEqual(
    readJson("src/v1/build-metadata.json"),
    buildMetadata
  );
  assert.doesNotMatch(
    JSON.stringify(buildMetadata),
    /terminal-launch|full-history/
  );
});

test("host adapters expose only explicit stable-skill invocation", () => {
  assert.deepEqual(Object.keys(codexAdapter), ["invokeCodexSkill"]);
  assert.deepEqual(Object.keys(claudeAdapter), ["invokeClaudeSkill"]);
  for (const relative of [
    "src/v1/adapters/codex.js",
    "src/v1/adapters/claude.js",
    "src/v1/adapters/shared.js"
  ]) {
    const source = fs.readFileSync(path.join(repoRoot, relative), "utf8");
    assert.doesNotMatch(
      source,
      /PreToolUse|hook_event_name|permissionDecision|updatedInput/
    );
  }
});

test("production plugin tree contains no lifecycle-hook declaration", () => {
  assert.equal(fs.existsSync(path.join(repoRoot, "hooks", "hooks.json")), false);
  assert.equal(
    fs.existsSync(
      path.join(repoRoot, "src", "v1", "adapters", "notice-hook.js")
    ),
    false
  );
  assert.equal(
    fs.existsSync(
      path.join(repoRoot, "runtime", "adapters", "notice-hook.js")
    ),
    false
  );
  assert.equal(
    Object.hasOwn(codexManifest, "hooks") ||
      Object.hasOwn(claudeManifest, "hooks"),
    false
  );
  assert.doesNotMatch(
    JSON.stringify([codexManifest, claudeManifest, buildMetadata]),
    /PreToolUse|automatic["']?\s*:\s*true|enforcement["']?\s*:\s*true/
  );
});

test("explicit status output carries advisory notice with no interception claim", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-notice-"));
  fs.writeFileSync(path.join(root, "README.md"), "# Fixture\n");
  const invocation = {
    schema: "kanon-stable-invocation-v1",
    skill: "status",
    root
  };
  const context = {
    transport: async () => ({
      ok: true,
      status_code: 200,
      content_type: "application/json",
      body: JSON.stringify({
        name: packageManifest.name,
        version: packageManifest.version
      })
    })
  };
  const codex = await codexAdapter.invokeCodexSkill(invocation, context);
  const claude = await claudeAdapter.invokeClaudeSkill(invocation, context);

  for (const result of [codex, claude]) {
    assert.equal(result.host.mode, "notice");
    assert.equal(result.host.enforcement, false);
    assert.equal(result.host.hook_status, "Unknown");
    assert.equal(result.host.lifecycle_notice_hook, "Unavailable");
    assert.equal(
      result.host.notice_delivery,
      "explicit-skill-and-status-output"
    );
    assert.equal(result.report.notice.advisory, true);
    assert.equal(result.report.notice.automatic, false);
    assert.equal(result.report.notice.blocks, false);
    assert.equal(result.report.notice.rewrites, false);
    assert.equal(result.report.notice.approves, false);
    assert.equal(result.report.notice.suppresses, false);
    assert.match(
      result.report.notice.future_requirement,
      /proven-executable-argument-vector-and-environment-boundary/
    );
    assert.match(
      result.report.diagnostics.join(" "),
      /Automatic lifecycle notice is unavailable/
    );
  }
  assert.deepEqual(codex.report.notice, claude.report.notice);
});

test("runtime remains ESM when copied below a CommonJS package boundary", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-esm-"));
  fs.writeFileSync(
    path.join(fixture, "package.json"),
    `${JSON.stringify({ type: "commonjs" })}\n`
  );
  fs.cpSync(
    path.join(repoRoot, "runtime"),
    path.join(fixture, "runtime"),
    { recursive: true }
  );
  const moduleUrl = pathToFileURL(
    path.join(fixture, "runtime", "core", "build-metadata.js")
  ).href;
  const execution = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `const m=await import(${JSON.stringify(moduleUrl)});const r=m.readEmbeddedBuildMetadata();if(!r.ok)process.exit(2)`
    ],
    {
      encoding: "utf8",
      timeout: 10_000
    }
  );
  assert.equal(execution.status, 0, execution.stderr);
});

test("package builder uses an exact production allowlist", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-package-"));
  const built = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "build-package.js"),
      "--output",
      output
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30_000
    }
  );
  assert.equal(built.status, 0, built.stderr);
  const actual = listFiles(output);
  const expected = [
    ...publicSkillFiles(repoRoot),
    "LICENSE",
    "MANIFEST.sha256",
    "README.md",
    "SBOM.json",
    "SECURITY.md",
    "package.json"
  ].sort();
  assert.deepEqual(actual, expected);
  assert.equal(actual.includes(".codex-plugin/plugin.json"), true);
  assert.equal(actual.includes(".claude-plugin/plugin.json"), true);
  assert.equal(actual.some((file) => /(?:^|\/)hooks\//.test(file)), false);
  assert.equal(actual.includes("runtime/adapters/notice-hook.js"), false);
  assert.equal(actual.includes("runtime/core/notice.js"), false);
  assert.equal(actual.includes("runtime/package.json"), true);
  assert.equal(actual.includes("runtime/build-metadata.json"), true);
  assert.equal(actual.includes("runtime/bin/kanon-dispatch"), true);
  assert.equal(actual.includes("runtime/bin/kanon-dispatch.ps1"), true);
  assert.equal(actual.includes("runtime/bin/kanon-write.js"), true);
  assert.equal(actual.includes("runtime/bin/kanon.js"), false);
  assert.equal(actual.includes("runtime/core/plugin-data.js"), true);
  assert.equal(actual.includes("runtime/core/receipt-store.js"), true);
  assert.equal(actual.includes("runtime/core/handoff.js"), true);
  assert.equal(actual.includes("runtime/core/handoff-store.js"), true);
  assert.equal(actual.includes("runtime/skills/aswitch.js"), true);
  const publicManifest = JSON.parse(
    fs.readFileSync(path.join(output, "package.json"), "utf8")
  );
  for (const entrypoint of [
    "bin",
    "browser",
    "exports",
    "main",
    "module",
    "types",
    "typings"
  ]) {
    assert.equal(
      Object.hasOwn(publicManifest, entrypoint),
      false,
      `published package must not advertise ${entrypoint}`
    );
  }
  assert.equal(actual.includes("index.js"), false);
  assert.equal(actual.includes("src/index.js"), false);
  assert.deepEqual(publicManifest.publishConfig, {
    access: "public",
    provenance: true,
    registry: "https://registry.npmjs.org"
  });
  const conformanceSource = fs.readFileSync(
    path.join(repoRoot, "scripts", "conform-artifact.js"),
    "utf8"
  );
  assert.match(conformanceSource, /kanon-aswitch-report-v1/);
  assert.match(conformanceSource, /AwaitingTarget/);
  assert.match(conformanceSource, /last-plan.*compacted.*full-history/s);
  assert.equal(
    actual.some((file) =>
      /^(?:docs|eval|src|test|spikes|node_modules)\//.test(file)
    ),
    false
  );
  for (const forbidden of [
    "package-lock.json",
    "tsconfig.json"
  ]) {
    assert.equal(actual.includes(forbidden), false);
  }
  assert.equal(
    actual.some((file) => /(?:launcher|transcript-reader)/i.test(file)),
    false
  );
  for (const disposableHook of [
    "spikes/guard-feasibility/codex-cli/marketplace/plugins/kanon-guard-spike-codex/hooks/hooks.json",
    "spikes/guard-feasibility/claude-code/plugin/hooks/hooks.json"
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, disposableHook)), true);
    assert.equal(actual.includes(disposableHook), false);
  }
  assert.equal(
    actual.some((file) => file.startsWith("skills/kanon/runtime/")),
    false
  );
  const shippedText = actual
    .filter((file) => /\.(?:js|json|md|ya?ml|ps1)$/.test(file))
    .map((file) => fs.readFileSync(path.join(output, file), "utf8"))
    .join("\n");
  assert.doesNotMatch(
    shippedText,
    /PreToolUse|hook_event_name|notice-hook\.js/
  );
  assert.doesNotMatch(
    shippedText,
    /dangerously-bypass-hook-trust|dangerously-skip-permissions/
  );
  assert.doesNotMatch(
    shippedText,
    /(?:^|["'`/])\.kanon\/(?:RECEIPT|receipt)/m
  );
  const packagedReadme = fs.readFileSync(
    path.join(output, "README.md"),
    "utf8"
  );
  assert.match(
    packagedReadme,
    /orient.*resume.*verify.*status.*steer.*aswitch/s
  );
  assert.match(packagedReadme, /no\s+production lifecycle hook/i);
  assert.match(packagedReadme, /no automatic lifecycle notice/i);
  assert.match(
    packagedReadme,
    /Native Codex and Claude plugin-data wiring is unproven[\s\S]*Unknown/
  );
  assert.match(packagedReadme, /never launches a host/);
  assert.doesNotMatch(packagedReadme, /shared `skills\/` and `hooks\/`/);
  assert.doesNotMatch(packagedReadme, /four read skills/);
  const runtimeText = actual
    .filter((file) =>
      /^(?:runtime\/.*\.js|\.codex-plugin\/.*\.json|\.claude-plugin\/.*\.json)$/.test(
        file
      )
    )
    .map((file) => fs.readFileSync(path.join(output, file), "utf8"))
    .join("\n");
  assert.doesNotMatch(
    runtimeText,
    /CODEX_HOME|CLAUDE_CONFIG_DIR|history\.jsonl|(?:^|[\\/])\.codex[\\/]sessions|(?:^|[\\/])\.claude[\\/]projects/m
  );
});

test("declared CI proof covers validation and installed conformance on all supported operating systems", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github", "workflows", "ci.yml"),
    "utf8"
  );
  for (const operatingSystem of [
    "ubuntu-latest",
    "windows-latest",
    "macos-latest"
  ]) {
    assert.match(workflow, new RegExp(`- ${operatingSystem}`));
  }
  assert.match(
    workflow,
    /Run mandatory validation matrix[\s\S]*npm run validate/
  );
  assert.match(
    workflow,
    /Exercise Ubuntu artifact[\s\S]*ci-artifact\.js conform/
  );
  assert.match(
    workflow,
    /cross-platform-conformance:[\s\S]*windows-latest[\s\S]*macos-latest[\s\S]*ci-artifact\.js conform/
  );
});

test("Run D.1 records every stable invariant without transferring platform or host evidence", () => {
  const record = fs.readFileSync(
    path.join(repoRoot, "docs", "v1-run-d1.md"),
    "utf8"
  );
  for (const surface of [
    "orient",
    "resume",
    "verify",
    "status",
    "steer",
    "aswitch",
    "compatibility routes",
    "deprecation checking",
    "receipt persistence",
    "plugin-data storage",
    "handoff storage",
    "Git observation",
    "generated wrappers",
    "installed artifact"
  ]) {
    assert.match(
      record,
      new RegExp(`\\| ${surface.replace("-", "\\-")} \\|`, "i")
    );
  }
  assert.match(
    record,
    /Synthetic adapter context is test evidence\s+only/
  );
  assert.match(record, /Native Windows and Ubuntu results remain Unknown/);
  assert.match(
    record,
    /Guard, automatic lifecycle notice, terminal launch adapters,\s+and full-history transfer remain outside/
  );
  assert.match(record, /Hard-stop before slice 16|does not authorize slice 16/i);
});

test("embedded metadata validator rejects extra, malformed, and hostile fields", () => {
  for (const value of [
    { ...buildMetadata, extra: true },
    { ...buildMetadata, package_version: "latest" },
    {
      ...buildMetadata,
      public_capabilities: {
        ...buildMetadata.public_capabilities,
        skills: ["kanon", "steer"]
      }
    },
    {
      ...buildMetadata,
      public_capabilities: {
        ...buildMetadata.public_capabilities,
        hosts: {
          ...buildMetadata.public_capabilities.hosts,
          "codex-cli": {
            mode: "guard",
            enforcement: true,
            hook_status: "Known"
          }
        }
      }
    },
    {
      ...buildMetadata,
      public_capabilities: {
        ...buildMetadata.public_capabilities,
        receipts: {
          ...buildMetadata.public_capabilities.receipts,
          enforcement: true
        }
      }
    }
  ]) {
    assert.deepEqual(validateEmbeddedBuildMetadata(value), {
      ok: false,
      status: "Unknown",
      diagnostic: "Embedded build metadata is unavailable or invalid."
    });
  }
});

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8"));
}

function listFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory()
        ? listFiles(target).map((child) => `${entry.name}/${child}`)
        : [entry.name];
    })
    .sort();
}
