import {
  addBuildTargetCommands,
  addPackageCommands,
  addPoeCommands,
  addWorkspaceBinaryAliases,
  detectPackageManager
} from "./manifest-commands.js";
import { addDocumentedCommands } from "./documented-commands.js";
import { addConventionalCommands } from "./conventional-commands.js";
import { selectCommand } from "./command-utils.js";
import { registeredHeuristic } from "./heuristics.js";

/**
 * @typedef {import("./command-utils.js").CommandCandidate} CommandCandidate
 * @typedef {import("./shared.js").CodeSignal} CodeSignal
 * @typedef {import("./shared.js").TextCache} TextCache
 * @typedef {import("../scanner/read.js").ScannedFile} ScannedFile
 * @typedef {{
 *   run: CommandCandidate[],
 *   test: CommandCandidate[],
 *   build: CommandCandidate[],
 *   dev: CommandCandidate[]
 * }} CommandCandidates
 */

/**
 * @param {string} root
 * @param {ScannedFile[]} files
 * @param {Map<string, ScannedFile>} fileMap
 * @param {TextCache} texts
 * @param {{
 *   packageJson: unknown,
 *   signals: Map<string, CodeSignal[]>
 * }} options
 */
export function detectRepoCommands(root, files, fileMap, texts, options) {
  for (const heuristic of [
    "manifest-command",
    "documented-command",
    "ecosystem-command-convention"
  ]) {
    registeredHeuristic(heuristic);
  }
  /** @type {CommandCandidates} */
  const candidates = { run: [], test: [], build: [], dev: [] };
  const packageManager = detectPackageManager(files, options.packageJson);
  if (fileMap.has("go.mod")) {
    registeredHeuristic("polyglot-root-precedence");
  }
  addPackageCommands(
    candidates,
    options.packageJson,
    packageManager,
    { primaryGoProject: fileMap.has("go.mod") }
  );
  addWorkspaceBinaryAliases(
    candidates,
    fileMap,
    options.signals,
    options.packageJson,
    packageManager
  );
  addPoeCommands(root, fileMap, texts, candidates);
  addBuildTargetCommands(root, fileMap, texts, candidates);
  addDocumentedCommands(
    root,
    files,
    fileMap,
    texts,
    candidates,
    {
      primaryGoProject: fileMap.has("go.mod"),
      signals: options.signals
    }
  );
  addConventionalCommands(
    root,
    files,
    fileMap,
    texts,
    candidates
  );
  return {
    packageManager,
    commands: {
      run: selectCommand(candidates.run),
      test: selectCommand(candidates.test),
      build: selectCommand(candidates.build),
      dev: selectCommand(candidates.dev)
    }
  };
}
