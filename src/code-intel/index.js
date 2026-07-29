import { CODE_EXTENSIONS, GENERATED_FILE } from "./constants.js";
import {
  extractFileReferences,
  extractImports,
  readGoModule,
  resolveImport
} from "./imports.js";
import {
  addManifestEntrypoints,
  detectEntrypointSignal
} from "./entrypoints.js";
import { detectRepoCommands } from "./commands.js";
import { rankImportantFiles } from "./rank.js";
import {
  addInbound,
  addSignal,
  createTextCache,
  getText
} from "./shared.js";

/**
 * @typedef {import("./shared.js").CodeSignal} CodeSignal
 * @typedef {import("../scanner/read.js").ScannedFile} ScannedFile
 */

/**
 * @param {string} root
 * @param {ScannedFile[]} files
 * @param {{
 *   readOptions?: NonNullable<Parameters<typeof getText>[2]>["readOptions"],
 *   packageJson?: unknown,
 *   rankingObserver?: import("./shared.js").RankingObserver
 * }} [options]
 */
export function inspectRepoCode(root, files, options = {}) {
  /** @type {Map<string, ScannedFile>} */
  const fileMap = new Map(files.map((file) => [file.path, file]));
  const texts = createTextCache(options.readOptions || {});
  /** @type {Map<string, Set<string>>} */
  const importers = new Map();
  /** @type {Map<string, Set<string>>} */
  const references = new Map();
  /** @type {Map<string, CodeSignal[]>} */
  const signals = new Map();
  const modulePath = readGoModule(root, fileMap, texts);

  for (const file of files) {
    if (
      !file.text ||
      !CODE_EXTENSIONS.has(file.extension) ||
      GENERATED_FILE.test(file.path)
    ) {
      continue;
    }
    const text = getText(root, file.path, texts);
    if (!text) {
      continue;
    }
    const entrypoint = detectEntrypointSignal(file.path, text);
    if (entrypoint) {
      addSignal(signals, file.path, entrypoint);
    }
    for (const specifier of extractImports(file.path, text)) {
      const target = resolveImport(file.path, specifier, fileMap, modulePath);
      if (target) {
        addInbound(importers, target, file.path);
      }
    }
    for (const target of extractFileReferences(file.path, text, fileMap)) {
      addInbound(references, target, file.path);
    }
  }

  addManifestEntrypoints(root, fileMap, texts, signals, options.packageJson);
  const detected = detectRepoCommands(root, files, fileMap, texts, {
    packageJson: options.packageJson,
    signals
  });
  const rankedFiles = rankImportantFiles(files, {
    importers,
    references,
    signals
  }, {
    ...(options.packageJson === undefined
      ? {}
      : { packageJson: options.packageJson }),
    goModule: modulePath,
    ...(options.rankingObserver === undefined
      ? {}
      : { observer: options.rankingObserver })
  });
  return {
    importers,
    references,
    signals,
    package_manager: detected.packageManager,
    commands: detected.commands,
    ranked_files: rankedFiles,
    entrypoints: rankedFiles
      .filter((item) =>
        item.signals.some((signal) => signal.type === "entrypoint")
      )
      .map((item) => ({
        path: item.path,
        confidence: item.signals.some(
          (signal) => signal.confidence === "known"
        ) ? "known" : "likely",
        reason: item.signals.find(
          (signal) => signal.type === "entrypoint"
        )?.reason
      }))
  };
}
