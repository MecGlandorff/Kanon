import path from "node:path";
import { addCommand } from "./command-utils.js";
import { getText, parseCargoBinPaths } from "./shared.js";

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
    const target = goRunTarget(entrypoints[0]);
    addCommand(candidates.run, `go run ${target}`, entrypoints[0], 105, "likely");
  }
}

function addDjangoCommands(root, files, texts, candidates) {
  const manageFiles = files
    .filter((file) => file.basename === "manage.py")
    .sort((a, b) => fileDepth(a.path) - fileDepth(b.path));
  if (manageFiles.length === 0) {
    return;
  }
  const manage = manageFiles[0];
  const directory = path.posix.dirname(manage.path);
  const cwd = directory === "." ? "." : directory;
  const executable = getText(root, manage.path, texts, 40_000).startsWith("#!");
  const prefix = executable ? "./manage.py" : "python manage.py";
  addCommand(candidates.run, `${prefix} runserver`, manage.path, 155, "likely", null, cwd);
  addCommand(candidates.test, `${prefix} test`, manage.path, 150, "likely", null, cwd);
}

function goRunTarget(filePath) {
  const directory = path.posix.dirname(filePath);
  return directory === "." ? filePath : `./${directory}`;
}

function fileDepth(relPath) {
  return relPath.split("/").length - 1;
}
