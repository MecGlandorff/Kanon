import {
  addBuildTargetCommands,
  addPackageCommands,
  addPoeCommands,
  detectPackageManager
} from "./manifest-commands.js";
import { addDocumentedCommands } from "./documented-commands.js";
import { addConventionalCommands } from "./conventional-commands.js";
import { selectCommand } from "./command-utils.js";

export function detectRepoCommands(root, files, fileMap, texts, options) {
  const candidates = { run: [], test: [], build: [], dev: [] };
  const packageManager = detectPackageManager(files, options.packageJson);
  addPackageCommands(
    candidates,
    options.packageJson,
    packageManager,
    { primaryGoProject: fileMap.has("go.mod") }
  );
  addPoeCommands(root, fileMap, texts, candidates);
  addBuildTargetCommands(root, fileMap, texts, candidates);
  addDocumentedCommands(
    root,
    files,
    fileMap,
    texts,
    candidates,
    { primaryGoProject: fileMap.has("go.mod") }
  );
  addConventionalCommands(
    root,
    files,
    fileMap,
    texts,
    options.signals,
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
