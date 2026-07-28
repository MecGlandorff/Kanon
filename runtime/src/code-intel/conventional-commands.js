import path from "node:path";
import { addCommand } from "./command-utils.js";
import { getText, parseCargoBinPaths } from "./shared.js";

/**
 * @typedef {import("./command-utils.js").CommandCandidate} CommandCandidate
 * @typedef {import("./shared.js").CodeSignal} CodeSignal
 * @typedef {import("./shared.js").TextCache} TextCache
 * @typedef {{path: string, basename: string}} CodeFile
 * @typedef {Map<string, CodeFile>} FileMap
 * @typedef {{
 *   run: CommandCandidate[],
 *   test: CommandCandidate[],
 *   build: CommandCandidate[],
 *   dev: CommandCandidate[]
 * }} CommandCandidates
 */

/**
 * @param {string} root
 * @param {CodeFile[]} files
 * @param {FileMap} fileMap
 * @param {TextCache} texts
 * @param {Map<string, CodeSignal[]>} signals
 * @param {CommandCandidates} candidates
 * @returns {void}
 */
export function addConventionalCommands(
  root,
  files,
  fileMap,
  texts,
  signals,
  candidates
) {
  addCargoCommands(files, fileMap, texts, root, candidates);
  addGoCommands(files, fileMap, signals, candidates);
  addDjangoCommands(root, files, texts, candidates);
}

/**
 * @param {CodeFile[]} files
 * @param {FileMap} fileMap
 * @param {TextCache} texts
 * @param {string} root
 * @param {CommandCandidates} candidates
 * @returns {void}
 */
function addCargoCommands(files, fileMap, texts, root, candidates) {
  const cargo = fileMap.get("Cargo.toml");
  if (!cargo) {
    return;
  }
  const text = getText(root, cargo.path, texts, 160_000);
  if (parseCargoBinPaths(text, fileMap).length > 0) {
    addCommand(candidates.run, "cargo run -- --help", cargo.path, 215, "likely");
  }
  if (
    files.some((file) => /(^|\/)tests?\//.test(file.path)) ||
    /\[\[test\]\]/.test(text)
  ) {
    addCommand(candidates.test, "cargo test", cargo.path, 205, "likely");
  }
}

/**
 * @param {CodeFile[]} files
 * @param {FileMap} fileMap
 * @param {Map<string, CodeSignal[]>} signals
 * @param {CommandCandidates} candidates
 * @returns {void}
 */
function addGoCommands(files, fileMap, signals, candidates) {
  const goMod = fileMap.get("go.mod");
  if (!goMod) {
    return;
  }
  if (files.some((file) => file.path.endsWith("_test.go"))) {
    addCommand(candidates.test, "go test ./...", goMod.path, 205, "likely");
  }
  const entrypoints = Array.from(signals.entries())
    .filter(
      ([filePath, items]) =>
        filePath.endsWith(".go") &&
        items.some((item) => item.type === "entrypoint")
    )
    .map(([filePath]) => filePath);
  if (entrypoints.length === 1) {
    const entrypoint = entrypoints[0];
    if (!entrypoint) {
      return;
    }
    const target = goRunTarget(entrypoint);
    addCommand(candidates.run, `go run ${target}`, entrypoint, 105, "likely");
  }
}

/**
 * @param {string} root
 * @param {CodeFile[]} files
 * @param {TextCache} texts
 * @param {CommandCandidates} candidates
 * @returns {void}
 */
function addDjangoCommands(root, files, texts, candidates) {
  const manageFiles = files
    .filter((file) => file.basename === "manage.py")
    .sort((a, b) => fileDepth(a.path) - fileDepth(b.path));
  if (manageFiles.length === 0) {
    return;
  }
  const manage = manageFiles[0];
  if (!manage) {
    return;
  }
  const directory = path.posix.dirname(manage.path);
  const cwd = directory === "." ? "." : directory;
  const executable = getText(root, manage.path, texts, 40_000).startsWith("#!");
  const prefix = executable ? "./manage.py" : "python manage.py";
  addCommand(candidates.run, `${prefix} runserver`, manage.path, 155, "likely", null, cwd);
  addCommand(candidates.test, `${prefix} test`, manage.path, 150, "likely", null, cwd);
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function goRunTarget(filePath) {
  const directory = path.posix.dirname(filePath);
  return directory === "." ? filePath : `./${directory}`;
}

/**
 * @param {string} relPath
 * @returns {number}
 */
function fileDepth(relPath) {
  return relPath.split("/").length - 1;
}
