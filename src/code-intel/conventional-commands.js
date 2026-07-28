import { addCommand } from "./command-utils.js";
import { getText } from "./shared.js";

/**
 * @typedef {import("./command-utils.js").CommandCandidate} CommandCandidate
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
 * @param {CommandCandidates} candidates
 * @returns {void}
 */
export function addConventionalCommands(
  root,
  files,
  fileMap,
  texts,
  candidates
) {
  addCargoCommands(files, fileMap, texts, root, candidates);
  addGoCommands(files, fileMap, candidates);
  addDjangoTestCommand(root, files, texts, candidates);
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
 * @param {CommandCandidates} candidates
 * @returns {void}
 */
function addGoCommands(files, fileMap, candidates) {
  const goMod = fileMap.get("go.mod");
  if (!goMod) {
    return;
  }
  if (files.some((file) => file.path.endsWith("_test.go"))) {
    addCommand(candidates.test, "go test ./...", goMod.path, 205, "likely");
  }
}

/**
 * @param {string} root
 * @param {CodeFile[]} files
 * @param {TextCache} texts
 * @param {CommandCandidates} candidates
 * @returns {void}
 */
function addDjangoTestCommand(root, files, texts, candidates) {
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
  const parts = manage.path.split("/");
  parts.pop();
  const cwd = parts.join("/") || ".";
  const executable = getText(root, manage.path, texts, 40_000).startsWith("#!");
  const prefix = executable ? "./manage.py" : "python manage.py";
  addCommand(candidates.test, `${prefix} test`, manage.path, 150, "likely", null, cwd);
}

/**
 * @param {string} relPath
 * @returns {number}
 */
function fileDepth(relPath) {
  return relPath.split("/").length - 1;
}
