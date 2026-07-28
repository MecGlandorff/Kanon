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
    "#kanon-continuity": "./src/continuity/engine.js"
  });
  assert.equal(fs.existsSync(path.join(repoRoot, "skills", "kanon", "runtime")), false);
  assert.equal(fs.existsSync(path.join(repoRoot, "runtime", "bin", "kanon.js")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "runtime", "bin", "kanon-v1.js")), true);
});

test("embedded metadata exposes only accurate notice-mode capabilities", () => {
  const validated = validateEmbeddedBuildMetadata(buildMetadata);
  assert.equal(validated.ok, true);
  assert.deepEqual(buildMetadata.public_capabilities.skills, [
    "kanon",
    "orient",
    "resume",
    "status",
    "verify"
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
  for (const skill of ["orient", "resume", "status", "verify"]) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, "skills", skill, "SKILL.md")),
      true
    );
  }
  for (const removed of ["steer", "aswitch"]) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, "skills", removed)),
      false
    );
  }
  assert.deepEqual(
    readJson("src/v1/build-metadata.json"),
    buildMetadata
  );
  assert.doesNotMatch(JSON.stringify(buildMetadata), /steer|aswitch/);
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
  assert.equal(actual.includes("runtime/core/plugin-data.js"), true);
  assert.equal(actual.includes("runtime/core/receipt-store.js"), true);
  assert.equal(
    actual.some((file) =>
      /^(?:docs|eval|src|test|spikes|node_modules)\//.test(file)
    ),
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
