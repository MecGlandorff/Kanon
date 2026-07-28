#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { atomicWriteContained } from "../src/persistence/safe-fs.js";
import { resolveContainedPath } from "../src/path-security.js";
import { safeJsonStringify } from "../src/trust.js";
import { validateEmbeddedBuildMetadata } from "../src/v1/core/build-metadata.js";
import {
  IMPLEMENTED_STABLE_SKILLS,
  PUBLIC_COMMANDS
} from "./lib/artifact-files.js";
import { npmInvocation } from "./lib/npm-runner.js";

const options = parseArgs(process.argv.slice(2));
const tarball = selectedFile(options.tarball);
const artifactSha256 = sha256(fs.readFileSync(tarball.path));
const installRoot = prepareEmptyDirectory(options.installRoot);
const npmResult = runNpm([
  "install",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  "--prefix",
  installRoot,
  tarball.path
]);
const reasons = [];
if (npmResult.status !== 0) {
  reasons.push(
    `npm install failed: ${
      npmResult.stderr.trim() ||
      npmResult.error?.message ||
      npmResult.status
    }`
  );
}

const packageRoot = path.join(
  installRoot,
  "node_modules",
  "@mecglandorff",
  "kanon"
);
const checks = [];
if (!reasons.length) {
  checks.push(...inspectPackage(packageRoot, options));
  checks.push(...verifyManifest(packageRoot));
  checks.push(...exerciseWrappers(packageRoot));
}
for (const check of checks) {
  if (!check.passed) {
    reasons.push(check.reason);
  }
}
const report = {
  schema: "kanon-artifact-conformance-v1",
  generated_at: new Date().toISOString(),
  candidate_commit: options.candidateCommit,
  candidate_version: options.candidateVersion,
  artifact_sha256: artifactSha256,
  environment: {
    node: process.version,
    os: process.platform,
    architecture: process.arch
  },
  installed_package_root: packageRoot,
  checks,
  passed: reasons.length === 0,
  reasons
};
writeReport(options.output, report);
process.stdout.write(`${safeJsonStringify(report)}\n`);
process.exitCode = report.passed ? 0 : 1;

function inspectPackage(root, input) {
  const checks = [];
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8")
    );
    checks.push(result(
      manifest.version === input.candidateVersion,
      "installed version matches candidate"
    ));
    checks.push(result(
      !manifest.scripts &&
      !manifest.bin &&
      !manifest.exports &&
      !manifest.dependencies,
      "public manifest exposes no scripts, bin, exports, or dependencies"
    ));
    const codexManifest = readJsonFile(
      root,
      ".codex-plugin/plugin.json",
      256 * 1024
    );
    const claudeManifest = readJsonFile(
      root,
      ".claude-plugin/plugin.json",
      256 * 1024
    );
    const runtimeManifest = readJsonFile(
      root,
      "runtime/package.json",
      64 * 1024
    );
    const buildMetadata = readJsonFile(
      root,
      "runtime/build-metadata.json",
      32 * 1024
    );
    checks.push(result(
      codexManifest.name === "kanon" &&
      claudeManifest.name === "kanon" &&
      codexManifest.version === input.candidateVersion &&
      claudeManifest.version === input.candidateVersion &&
      codexManifest.skills === "./skills/" &&
      claudeManifest.skills === "./skills/",
      "separate host manifests share the package version and skill root"
    ));
    checks.push(result(
      runtimeManifest.private === true &&
      runtimeManifest.type === "module" &&
      runtimeManifest.imports?.["#kanon-continuity"] ===
        "./src/continuity/engine.js" &&
      !runtimeManifest.dependencies,
      "shared runtime has an independent ESM boundary, continuity binding, and no dependencies"
    ));
    const metadataResult = validateEmbeddedBuildMetadata(buildMetadata);
    checks.push(result(
      metadataResult.ok &&
      metadataResult.value.package_version === input.candidateVersion &&
      JSON.stringify(metadataResult.value.public_capabilities.skills) ===
        JSON.stringify(["kanon", ...IMPLEMENTED_STABLE_SKILLS]) &&
      metadataResult.value.public_capabilities.hosts["codex-cli"]
        .enforcement === false &&
      metadataResult.value.public_capabilities.hosts["claude-code"]
        .enforcement === false &&
      metadataResult.value.public_capabilities.hosts["codex-cli"]
        .lifecycle_notice_hook === "Unavailable" &&
      metadataResult.value.public_capabilities.hosts["claude-code"]
        .lifecycle_notice_hook === "Unavailable" &&
      metadataResult.value.public_capabilities.notice.automatic === false &&
      metadataResult.value.public_capabilities.notice.delivery ===
        "explicit-skill-and-status-output" &&
      metadataResult.value.public_capabilities.receipts.enforcement ===
        false &&
      metadataResult.value.public_capabilities.receipts.evaluation ===
        "explicit-kanon-invocation-only" &&
      metadataResult.value.public_capabilities.receipts.persistence ===
        "validated-plugin-data-when-available" &&
      metadataResult.value.public_capabilities.receipts.repository_fallback ===
        false,
      "embedded capability metadata is valid, explicit-only, receipt-aware, and non-enforcing"
    ));
    checks.push(result(
      !Object.hasOwn(codexManifest, "hooks") &&
      !Object.hasOwn(claudeManifest, "hooks"),
      "host manifests declare no production lifecycle hook"
    ));
    checks.push(result(
      fs.statSync(
        path.join(root, "runtime", "core", "plugin-data.js")
      ).isFile() &&
      fs.statSync(
        path.join(root, "runtime", "core", "receipt-store.js")
      ).isFile() &&
      fs.statSync(
        path.join(root, "runtime", "core", "handoff.js")
      ).isFile() &&
      fs.statSync(
        path.join(root, "runtime", "core", "handoff-store.js")
      ).isFile() &&
      fs.statSync(
        path.join(root, "runtime", "skills", "aswitch.js")
      ).isFile(),
      "shared hardened plugin-data, receipt, and handoff modules are shipped"
    ));
    const shipped = fs
      .readdirSync(path.join(root, "skills", "kanon", "scripts"))
      .sort();
    const expected = PUBLIC_COMMANDS
      .flatMap((command) => [
        `kanon-${command}`,
        `kanon-${command}.ps1`
      ])
      .sort();
    checks.push(result(
      JSON.stringify(shipped) === JSON.stringify(expected),
      "only supported compatibility wrappers are shipped"
    ));
    for (const skill of IMPLEMENTED_STABLE_SKILLS) {
      const stableScripts = fs
        .readdirSync(path.join(root, "skills", skill, "scripts"))
        .sort();
      checks.push(result(
        fs.statSync(path.join(root, "skills", skill, "SKILL.md")).isFile() &&
        JSON.stringify(stableScripts) === JSON.stringify([
          `kanon-${skill}`,
          `kanon-${skill}.ps1`
        ]),
        `stable ${skill} skill and wrappers are shipped`
      ));
    }
    const all = allFiles(root).map((file) =>
      path.relative(root, file).replaceAll("\\", "/")
    );
    checks.push(result(
      !all.some((file) =>
        /(?:^|\/)hooks(?:\/|$)|notice-hook\.js$/.test(file)
      ),
      "installed artifact contains no lifecycle-hook declaration or runner"
    ));
    const lifecycleSurface = all
      .filter((file) => /\.(?:js|json|ya?ml)$/.test(file))
      .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
      .join("\n");
    checks.push(result(
      !/PreToolUse|hook_event_name|notice-hook\.js/.test(lifecycleSurface),
      "installed executable and manifest content contains no lifecycle-hook surface"
    ));
    checks.push(result(
      !all.some((file) =>
        /(?:^|\/)(?:improve|refactor)(?:\/|\.js$)/.test(file)
      ),
      "experimental improve/refactor modules are absent"
    ));
    checks.push(result(
      !all.some((file) =>
        /(?:^|\/)(?:terminal-launch|full-history)(?:\/|[.-])/.test(file)
      ),
      "unimplemented terminal-launch and full-history surfaces are absent"
    ));
  } catch (error) {
    checks.push(result(false, `package inspection failed: ${error.message}`));
  }
  return checks;
}

function readJsonFile(root, relative, maximumBytes) {
  const selected = resolveContainedPath(root, relative, { type: "file" });
  if (!selected.ok || selected.stat.size > maximumBytes) {
    throw new Error(`unsafe or oversized JSON file: ${relative}`);
  }
  const value = JSON.parse(fs.readFileSync(selected.path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`JSON file must contain an object: ${relative}`);
  }
  return value;
}

function verifyManifest(root) {
  const checks = [];
  try {
    const lines = fs
      .readFileSync(path.join(root, "MANIFEST.sha256"), "utf8")
      .trim()
      .split("\n");
    for (const line of lines) {
      const match = line.match(/^([0-9a-f]{64})  (.+)$/);
      if (!match) {
        throw new Error(`invalid manifest line: ${line}`);
      }
      const file = resolveContainedPath(root, match[2], { type: "file" });
      if (!file.ok || sha256(fs.readFileSync(file.path)) !== match[1]) {
        throw new Error(`manifest mismatch: ${match[2]}`);
      }
    }
    checks.push(result(true, "content manifest hashes match"));
  } catch (error) {
    checks.push(result(false, `content manifest failed: ${error.message}`));
  }
  return checks;
}

function exerciseWrappers(packageRoot) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-conform-"));
  try {
    return exerciseWrappersInFixture(packageRoot, fixture);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

function exerciseWrappersInFixture(packageRoot, fixture) {
  const checks = [];
  const marker = path.join(fixture, "repository-code-executed");
  const hostileNodeMarker = path.join(fixture, "hostile-node-executed");
  const hostileDirnameMarker = path.join(
    fixture,
    "hostile-dirname-executed"
  );
  const bashEnvironmentMarker = path.join(
    fixture,
    "hostile-bash-environment-executed"
  );
  const nodeOptionsMarker = path.join(
    fixture,
    "hostile-node-options-executed"
  );
  const nodeRedirectWarnings = path.join(
    fixture,
    "hostile-node-redirect-warnings"
  );
  const nodeCoverage = path.join(fixture, "hostile-node-coverage");
  const nodeCompileCache = path.join(
    fixture,
    "hostile-node-compile-cache"
  );
  fs.writeFileSync(
    path.join(fixture, "hostile-bash-environment"),
    `: > ${JSON.stringify(bashEnvironmentMarker)}\n`
  );
  fs.writeFileSync(
    path.join(fixture, "hostile-node-options.cjs"),
    `require("node:fs").writeFileSync(${JSON.stringify(
      nodeOptionsMarker
    )}, "executed");\n`
  );
  fs.writeFileSync(path.join(fixture, "README.md"), "# Fixture\n\nRun `npm test`.\n");
  fs.writeFileSync(
    path.join(fixture, "package.json"),
    `${JSON.stringify({
      name: "fixture",
      description: "Conformance fixture",
      scripts: {
        test: `node -e "require('fs').writeFileSync(${JSON.stringify(marker)},'bad')"`
      }
    })}\n`
  );
  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(fixture, "node.cmd"),
      "@echo off\r\ntype nul > \"%CD%\\hostile-node-executed\"\r\nexit /b 97\r\n"
    );
    fs.writeFileSync(
      path.join(fixture, "dirname.cmd"),
      "@echo off\r\ntype nul > \"%CD%\\hostile-dirname-executed\"\r\nexit /b 97\r\n"
    );
  } else {
    for (const [name, markerName] of [
      ["node", "hostile-node-executed"],
      ["dirname", "hostile-dirname-executed"]
    ]) {
      const hostile = path.join(fixture, name);
      fs.writeFileSync(
        hostile,
        `#!/bin/sh\n: > "$PWD/${markerName}"\nexit 97\n`
      );
      fs.chmodSync(hostile, 0o755);
    }
  }
  const scripts = path.join(packageRoot, "skills", "kanon", "scripts");
  const family = process.platform === "win32" ? "powershell" : "bash";
  for (const command of PUBLIC_COMMANDS) {
    checks.push(
      exerciseWrapper(
        path.join(scripts, wrapperName(command, family)),
        command,
        family,
        fixture,
        "compatibility"
      )
    );
  }
  for (const skill of IMPLEMENTED_STABLE_SKILLS) {
    checks.push(
      exerciseWrapper(
        path.join(
          packageRoot,
          "skills",
          skill,
          "scripts",
          wrapperName(skill, family)
        ),
        skill,
        family,
        fixture,
        "stable"
      )
    );
  }
  checks.push(result(
    !fs.existsSync(marker),
    "declared destructive package script was not executed"
  ));
  checks.push(result(
    !fs.existsSync(hostileNodeMarker),
    "repository-controlled PATH node executable was not executed"
  ));
  checks.push(result(
    !fs.existsSync(hostileDirnameMarker),
    "repository-controlled PATH dirname executable was not executed"
  ));
  checks.push(result(
    !fs.existsSync(bashEnvironmentMarker),
    "repository-controlled BASH_ENV startup file was not executed"
  ));
  checks.push(result(
    !fs.existsSync(nodeOptionsMarker),
    "repository-controlled NODE_OPTIONS module was not executed"
  ));
  checks.push(result(
    !fs.existsSync(nodeRedirectWarnings) &&
      !fs.existsSync(nodeCoverage) &&
      !fs.existsSync(nodeCompileCache),
    "repository-controlled Node write destinations were not used"
  ));
  checks.push(result(
    fs.existsSync(path.join(fixture, ".kanon", "STATE.json")),
    "refresh exercised bounded write workflow"
  ));
  return checks;
}

function exerciseWrapper(wrapper, command, family, fixture, surface) {
  const args = wrapperArguments(command);
  const input = wrapperInput(command);
  const execution = family === "powershell"
    ? spawnPowerShell(wrapper, args, fixture, true, input)
    : spawnSync(wrapper, args, runOptions(fixture, true, input));
  const semantic = execution.status === 0
    ? validateStableJsonWrapper(command, execution.stdout)
    : { ok: false, diagnostic: "" };
  const passed = execution.status === 0 && semantic.ok;
  return {
    name: `${family} ${surface} wrapper ${command}`,
    passed,
    reason:
      passed
        ? `${family} ${surface} wrapper ${command} passed${
            semantic.diagnostic ? `: ${semantic.diagnostic}` : ""
          }`
        : `${family} ${surface} wrapper ${command} failed: ${
            semantic.diagnostic ||
            execution.stderr?.trim() ||
            execution.status
          }`
  };
}

function validateStableJsonWrapper(command, stdout) {
  if (command !== "steer" && command !== "aswitch") {
    return { ok: true, diagnostic: "" };
  }
  try {
    const output = JSON.parse(stdout);
    const baseValid =
      output?.schema === "kanon-stable-skill-result-v1" &&
      output.skill === command &&
      output.host?.mode === "notice" &&
      output.host.enforcement === false;
    if (!baseValid) {
      return {
        ok: false,
        diagnostic: `${command} output failed the stable result contract`
      };
    }
    if (command === "steer") {
      const valid =
        output.report?.schema === "kanon-steer-report-v1" &&
        output.report.state?.schema === "kanon-steer-state-v1" &&
        output.report.state.authorization === false;
      return {
        ok: valid,
        diagnostic: valid
          ? "validated non-authorizing steer result"
          : "steer output failed the state contract"
      };
    }
    const modes = output.report?.payload_options?.map(
      (option) => option?.mode
    );
    const valid =
      output.report?.schema === "kanon-aswitch-report-v1" &&
      output.report.stage === "AwaitingTarget" &&
      output.report.authorization === false &&
      output.report.automatic_launch === false &&
      JSON.stringify(modes) ===
        JSON.stringify(["last-plan", "compacted", "full-history"]);
    return {
      ok: valid,
      diagnostic: valid
        ? "validated consent-gated aswitch result"
        : "aswitch output failed the handoff contract"
    };
  } catch {
    return {
      ok: false,
      diagnostic: `${command} output was not valid JSON`
    };
  }
}

function wrapperName(command, family) {
  return `kanon-${command}${family === "powershell" ? ".ps1" : ""}`;
}

function wrapperArguments(command) {
  if (command === "ask") {
    return ["what is this repo's purpose?"];
  }
  if (command === "verify") {
    return ["README.md"];
  }
  if (command === "todo") {
    return ["list"];
  }
  if (command === "orient") {
    return ["artifact conformance"];
  }
  if (command === "steer") {
    return ["--state-stdin", "--json"];
  }
  if (command === "aswitch") {
    return ["--request-stdin", "--json"];
  }
  return command === "brief" ? ["--json"] : [];
}

function wrapperInput(command) {
  if (command === "steer") {
    return `${JSON.stringify({
        schema: "kanon-steer-request-v1",
        phase: "understand",
        desired_outcome: "verify installed artifact behavior",
        completion_criteria: ["installed wrapper exits successfully"],
        constraints: ["do not execute repository code"],
        user_decisions: [],
        evidence_references: [],
        unknowns: [],
        next_slice: {
          objective: "inspect one bounded installed wrapper",
          boundaries: ["read-only invocation"]
        },
        required_verification: ["observe wrapper status"],
        stop_or_redirect_reasons: []
      })}\n`;
  }
  if (command === "aswitch") {
    return `${JSON.stringify({
      schema: "kanon-aswitch-request-v1",
      operation: "preview",
      target_host: null,
      payload_mode: null,
      destination_root: null,
      last_plan: null,
      compacted: null,
      approval: null
    })}\n`;
  }
  return undefined;
}

function spawnPowerShell(
  wrapper,
  args,
  cwd,
  poisonPath = false,
  input = undefined
) {
  for (const binary of ["pwsh", "powershell.exe"]) {
    const found = spawnSync(
      binary,
      ["-NoProfile", "-File", wrapper, ...args],
      runOptions(cwd, poisonPath, input)
    );
    if (!found.error || found.error.code !== "ENOENT") {
      return found;
    }
  }
  return { status: null, stderr: "PowerShell unavailable" };
}

function runOptions(cwd, poisonPath = false, input = undefined) {
  return {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      BASH_ENV: path.join(cwd, "hostile-bash-environment"),
      GIT_TERMINAL_PROMPT: "0",
      NODE_COMPILE_CACHE: path.join(
        cwd,
        "hostile-node-compile-cache"
      ),
      NODE_OPTIONS:
        `--require=${path.join(cwd, "hostile-node-options.cjs")}`,
      NODE_PATH: cwd,
      NODE_REDIRECT_WARNINGS: path.join(
        cwd,
        "hostile-node-redirect-warnings"
      ),
      NODE_V8_COVERAGE: path.join(cwd, "hostile-node-coverage"),
      ...(poisonPath
        ? {
            PATH: `${cwd}${path.delimiter}${process.env.PATH || ""}`
          }
        : {})
    },
    maxBuffer: 8 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
    ...(input === undefined ? {} : { input })
  };
}

function runNpm(args) {
  const invocation = npmInvocation(args);
  return spawnSync(invocation.command, invocation.args, {
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_ignore_scripts: "true",
      npm_config_userconfig: os.devNull
    },
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60_000,
    windowsHide: true
  });
}

function parseArgs(argv) {
  const output = {};
  const flags = new Map([
    ["--tarball", "tarball"],
    ["--install-root", "installRoot"],
    ["--output", "output"],
    ["--candidate-commit", "candidateCommit"],
    ["--candidate-version", "candidateVersion"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const field = flags.get(argv[index]);
    if (!field || !argv[index + 1]) {
      throw new Error(`Unknown or incomplete option: ${argv[index]}`);
    }
    output[field] = argv[++index];
  }
  for (const field of flags.values()) {
    if (!output[field]) {
      throw new Error(`Missing required conformance field: ${field}`);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(output.candidateCommit)) {
    throw new Error("candidate commit must be a full Git SHA.");
  }
  return output;
}

function selectedFile(value) {
  const resolved = path.resolve(value);
  const parent = fs.realpathSync(path.dirname(resolved));
  const file = resolveContainedPath(parent, path.basename(resolved), {
    type: "file"
  });
  if (!file.ok) throw new Error(`Unsafe selected file: ${file.reason}`);
  return file;
}

function prepareEmptyDirectory(value) {
  const resolved = path.resolve(value);
  const parent = path.dirname(resolved);
  const parentRoot = resolveContainedPath(parent, ".", {
    allowRoot: true,
    type: "directory"
  });
  if (!parentRoot.ok) {
    throw new Error(`install-root parent is unsafe: ${parentRoot.reason}`);
  }
  const name = path.basename(resolved);
  let target = resolveContainedPath(parentRoot.root, name, {
    type: "directory"
  });
  if (target.status === "missing") {
    fs.mkdirSync(target.path, { mode: 0o700, recursive: false });
    target = resolveContainedPath(parentRoot.root, name, {
      type: "directory"
    });
  }
  if (!target.ok) {
    throw new Error(`install root is unsafe: ${target.reason}`);
  }
  if (fs.readdirSync(target.path).length) {
    throw new Error("install root must be empty");
  }
  return target.path;
}

function writeReport(value, report) {
  const resolved = path.resolve(value);
  const parent = fs.realpathSync(path.dirname(resolved));
  atomicWriteContained(
    parent,
    path.basename(resolved),
    `${safeJsonStringify(report)}\n`
  );
}

function allFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? allFiles(target) : [target];
  });
}

function result(passed, reason) {
  return { name: reason, passed, reason: passed ? reason : `failed: ${reason}` };
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
