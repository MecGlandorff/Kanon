import { types as nodeTypes } from "node:util";
import { findByPath } from "../scanner.js";
import { addCommand, isPlaceholderScript, packageScriptCommand } from "./command-utils.js";
import { getText, parseBuildTargets, tomlSection } from "./shared.js";

/**
 * @typedef {import("./command-utils.js").CommandCandidate} CommandCandidate
 * @typedef {import("./shared.js").TextCache} TextCache
 * @typedef {import("../scanner/read.js").ScannedFile} ScannedFile
 * @typedef {Map<string, ScannedFile>} FileMap
 * @typedef {"npm" | "pnpm" | "yarn" | "bun"} PackageManager
 * @typedef {{
 *   run: CommandCandidate[],
 *   test: CommandCandidate[],
 *   build: CommandCandidate[],
 *   dev: CommandCandidate[]
 * }} CommandCandidates
 */

/**
 * @param {CommandCandidates} candidates
 * @param {unknown} packageJson
 * @param {PackageManager} packageManager
 * @param {{primaryGoProject?: boolean}} [options]
 * @returns {void}
 */
export function addPackageCommands(
  candidates,
  packageJson,
  packageManager,
  options = {}
) {
  const scripts = plainRecord(packageJson) && plainRecord(packageJson.scripts)
    ? packageJson.scripts
    : null;
  if (!scripts) {
    return;
  }
  const source = "package.json";
  for (const name of ["test"]) {
    if (options.primaryGoProject) {
      break;
    }
    const script = scripts[name];
    if (typeof script === "string" && !isPlaceholderScript(script)) {
      addCommand(
        candidates.test,
        packageScriptCommand(packageManager, name),
        source,
        name === "test" ? 205 : 198,
        "known",
        script
      );
      break;
    }
  }
  for (const name of ["start", "dev", "serve", "watch"]) {
    if (options.primaryGoProject) {
      break;
    }
    const script = scripts[name];
    if (typeof script !== "string") {
      continue;
    }
    const command = packageScriptCommand(packageManager, name);
    const score =
      name === "start" ? 205 :
      name === "dev" ? 202 :
      name === "serve" ? 198 :
      194;
    addCommand(candidates.run, command, source, score, "known", script);
    if (name === "dev" || name === "watch") {
      addCommand(candidates.dev, command, source, score, "known", script);
    }
  }
  if (typeof scripts.build === "string") {
    addCommand(
      candidates.build,
      packageScriptCommand(packageManager, "build"),
      source,
      200,
      "known",
      scripts.build
    );
  }
}

/**
 * @param {string} root
 * @param {FileMap} fileMap
 * @param {TextCache} texts
 * @param {CommandCandidates} candidates
 * @returns {void}
 */
export function addPoeCommands(root, fileMap, texts, candidates) {
  const file = fileMap.get("pyproject.toml");
  if (!file) {
    return;
  }
  const text = getText(root, file.path, texts, 220_000);
  const section = tomlSection(text, "tool.poe.tasks");
  if (!section) {
    return;
  }
  /** @type {Set<string>} */
  const tasks = new Set();
  for (const match of section.matchAll(/^([A-Za-z0-9_.-]+)\s*=/gm)) {
    const task = match[1]?.split(".")[0];
    if (task) {
      tasks.add(task);
    }
  }
  const prefix = fileMap.has("uv.lock") ? "uv run " : "";
  if (tasks.has("start")) {
    addCommand(candidates.run, `${prefix}poe start`, file.path, 220, "known");
  }
  if (tasks.has("test")) {
    addCommand(candidates.test, `${prefix}poe test`, file.path, 220, "known");
  }
}

/**
 * @param {string} root
 * @param {FileMap} fileMap
 * @param {TextCache} texts
 * @param {CommandCandidates} candidates
 * @returns {void}
 */
export function addBuildTargetCommands(root, fileMap, texts, candidates) {
  for (const buildFile of ["Makefile", "makefile", "GNUmakefile"]) {
    const file = fileMap.get(buildFile);
    if (!file) {
      continue;
    }
    const targets = parseBuildTargets(getText(root, file.path, texts, 180_000));
    if (targets.has("run")) {
      addCommand(candidates.run, "make run", file.path, 215, "known");
    } else if (targets.has("serve")) {
      addCommand(candidates.run, "make serve", file.path, 210, "known");
    }
    if (targets.has("test")) {
      addCommand(candidates.test, "make test", file.path, 215, "known");
    }
    if (targets.has("build")) {
      addCommand(candidates.build, "make", file.path, 190, "known");
    }
  }
  addJustCommands(root, fileMap, texts, candidates);
}

/**
 * @param {ScannedFile[]} files
 * @param {unknown} packageJson
 * @returns {PackageManager}
 */
export function detectPackageManager(files, packageJson) {
  const declaredValue = plainRecord(packageJson)
    ? packageJson.packageManager
    : "";
  const declared = typeof declaredValue === "string"
    ? declaredValue.split("@")[0]
    : "";
  if (
    declared === "pnpm" ||
    declared === "yarn" ||
    declared === "npm" ||
    declared === "bun"
  ) {
    return declared;
  }
  if (findByPath(files, "pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (findByPath(files, "yarn.lock")) {
    return "yarn";
  }
  if (findByPath(files, "bun.lock") || findByPath(files, "bun.lockb")) {
    return "bun";
  }
  return "npm";
}

/**
 * @param {string} root
 * @param {FileMap} fileMap
 * @param {TextCache} texts
 * @param {CommandCandidates} candidates
 * @returns {void}
 */
function addJustCommands(root, fileMap, texts, candidates) {
  for (const buildFile of ["justfile", "Justfile"]) {
    const file = fileMap.get(buildFile);
    if (!file) {
      continue;
    }
    const targets = parseBuildTargets(getText(root, file.path, texts, 180_000));
    if (targets.has("run")) {
      addCommand(candidates.run, "just run", file.path, 195, "known");
    }
    if (targets.has("test")) {
      addCommand(candidates.test, "just test", file.path, 225, "known");
    }
    if (targets.has("build")) {
      addCommand(candidates.build, "just build", file.path, 195, "known");
    }
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function plainRecord(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => !descriptor.get && !descriptor.set
  );
}
