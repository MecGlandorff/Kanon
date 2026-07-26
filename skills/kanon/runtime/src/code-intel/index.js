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
import { addInbound, addSignal, getText } from "./shared.js";

export function inspectRepoCode(root, files, options = {}) {
  const fileMap = new Map(files.map((file) => [file.path, file]));
  const texts = new Map();
  const importers = new Map();
  const references = new Map();
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
    packageJson: options.packageJson
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
