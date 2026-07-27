import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { adaptClaudeNotice } from "../src/v1/adapters/claude.js";
import { adaptCodexNotice } from "../src/v1/adapters/codex.js";
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
const hookManifest = readJson("hooks/hooks.json");
const buildMetadata = readJson("runtime/build-metadata.json");

test("dual-host manifests are separate and share one skill and runtime root", () => {
  assert.equal(codexManifest.name, "kanon");
  assert.equal(claudeManifest.name, "kanon");
  assert.equal(codexManifest.version, packageManifest.version);
  assert.equal(claudeManifest.version, packageManifest.version);
  assert.equal(codexManifest.skills, "./skills/");
  assert.equal(claudeManifest.skills, "./skills/");
  assert.notEqual(
    path.join(repoRoot, ".codex-plugin", "plugin.json"),
    path.join(repoRoot, ".claude-plugin", "plugin.json")
  );
  assert.equal(readJson("runtime/package.json").type, "module");
  assert.equal(fs.existsSync(path.join(repoRoot, "skills", "kanon", "runtime")), false);
  assert.equal(fs.existsSync(path.join(repoRoot, "runtime", "bin", "kanon.js")), true);
});

test("embedded metadata exposes only accurate notice-mode capabilities", () => {
  const validated = validateEmbeddedBuildMetadata(buildMetadata);
  assert.equal(validated.ok, true);
  assert.deepEqual(buildMetadata.public_capabilities.skills, ["kanon"]);
  assert.equal(buildMetadata.package_name, packageManifest.name);
  assert.equal(buildMetadata.package_version, packageManifest.version);
  assert.deepEqual(
    buildMetadata.public_capabilities.hosts,
    {
      "codex-cli": {
        mode: "notice",
        enforcement: false,
        hook_status: "Unknown"
      },
      "claude-code": {
        mode: "notice",
        enforcement: false,
        hook_status: "Unknown"
      }
    }
  );
  assert.deepEqual(
    buildMetadata.public_capabilities.notice,
    {
      advisory: true,
      blocks: false,
      rewrites: false,
      approves: false,
      suppresses: false,
      forces_reading: false,
      claims_understanding: false
    }
  );
  const read = readEmbeddedBuildMetadata();
  assert.equal(read.ok, true);
  assert.equal(
    fs.existsSync(path.join(repoRoot, "skills", "kanon-orient")),
    false
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, "skills", "kanon-status")),
    false
  );
  assert.doesNotMatch(JSON.stringify(buildMetadata), /steer|aswitch/);
});

test("host adapters validate and normalize without retaining host values", () => {
  const hostile = {
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: {
      file_path: "/private/secret",
      content: "<script>repository-controlled</script>"
    },
    session_id: "secret-session",
    turn_id: "secret-turn",
    cwd: "/secret/repository"
  };
  const codex = adaptCodexNotice(hostile);
  const claude = adaptClaudeNotice(hostile);
  assert.equal(codex.ok, true);
  assert.equal(claude.ok, true);
  assert.deepEqual(codex.output, claude.output);
  assert.equal(codex.event.host, "codex-cli");
  assert.equal(claude.event.host, "claude-code");
  for (const value of [
    JSON.stringify(codex),
    JSON.stringify(claude)
  ]) {
    assert.doesNotMatch(value, /secret|repository-controlled|script/);
  }
});

test("host adapters fail to Unknown for malformed, unsupported, or oversized input", () => {
  for (const input of [
    null,
    [],
    {},
    {
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_input: {}
    },
    {
      hook_event_name: "PreToolUse",
      tool_name: "UnknownTool",
      tool_input: {}
    },
    {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: {},
      session_id: "x".repeat(257)
    },
    Object.assign(Object.create(null), {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: {}
    })
  ]) {
    assert.deepEqual(adaptCodexNotice(input), {
      ok: false,
      status: "Unknown",
      diagnostic:
        "Host hook input was unavailable or invalid; hook state remains Unknown."
    });
    assert.deepEqual(adaptClaudeNotice(input), {
      ok: false,
      status: "Unknown",
      diagnostic:
        "Host hook input was unavailable or invalid; hook state remains Unknown."
    });
  }
});

test("shared notice hook is observational and equivalent for both hosts", () => {
  const event = JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { content: "hostile-data-must-not-return" },
    session_id: "session"
  });
  const codex = runHook(event, { PLUGIN_ROOT: repoRoot });
  const claude = runHook(event, { CLAUDE_PLUGIN_ROOT: repoRoot });
  assert.equal(codex.status, 0);
  assert.equal(claude.status, 0);
  assert.equal(codex.stdout, claude.stdout);
  assert.deepEqual(Object.keys(JSON.parse(codex.stdout)), ["systemMessage"]);
  assert.doesNotMatch(codex.stdout, /hostile-data-must-not-return/);
  assert.doesNotMatch(
    codex.stdout,
    /permissionDecision|updatedInput|continue|stopReason|suppressOutput/
  );
  assert.equal(hookManifest.hooks.PreToolUse[0].matcher, "Bash|Write|Edit|apply_patch");
  assert.doesNotMatch(
    JSON.stringify(hookManifest),
    /permissionDecision|updatedInput|auto.?approve|suppressOutput/
  );
});

test("shared notice hook fails open for malformed and oversized input", () => {
  for (const input of [
    "{not json",
    "",
    "x".repeat(64 * 1024 + 1)
  ]) {
    const result = runHook(input, { PLUGIN_ROOT: repoRoot });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /remains Unknown/);
  }
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
  assert.equal(actual.includes("hooks/hooks.json"), true);
  assert.equal(actual.includes("runtime/package.json"), true);
  assert.equal(actual.includes("runtime/build-metadata.json"), true);
  assert.equal(
    actual.some((file) =>
      /^(?:docs|eval|src|test|spikes|node_modules)\//.test(file)
    ),
    false
  );
  assert.equal(
    actual.some((file) => file.startsWith("skills/kanon/runtime/")),
    false
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

function runHook(input, hostEnvironment) {
  return spawnSync(
    process.execPath,
    [path.join(repoRoot, "runtime", "adapters", "notice-hook.js")],
    {
      cwd: repoRoot,
      input,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        ...hostEnvironment
      },
      timeout: 10_000,
      maxBuffer: 256 * 1024
    }
  );
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
