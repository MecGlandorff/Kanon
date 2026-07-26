import { findByPath } from "../scanner.js";
import { addCommand, isPlaceholderScript, packageScriptCommand } from "./command-utils.js";
import { getText, parseBuildTargets, tomlSection } from "./shared.js";

export function addPackageCommands(
  candidates,
  packageJson,
  packageManager,
  options = {}
) {
  const scripts = packageJson?.scripts;
  if (!scripts || typeof scripts !== "object") {
    return;
  }
  const source = "package.json";
  for (const name of ["test", "test:kit"]) {
    if (options.primaryGoProject) {
      break;
    }
    if (
      typeof scripts[name] === "string" &&
      !isPlaceholderScript(scripts[name])
    ) {
      addCommand(
        candidates.test,
        packageScriptCommand(packageManager, name),
        source,
        name === "test" ? 205 : 198,
        "known",
        scripts[name]
      );
      break;
    }
  }
  for (const name of ["start", "dev", "serve", "watch", "turbo"]) {
    if (options.primaryGoProject) {
      break;
    }
    if (typeof scripts[name] !== "string") {
      continue;
    }
    const command = packageScriptCommand(packageManager, name);
    const score =
      name === "start" ? 205 :
      name === "dev" ? 202 :
      name === "serve" ? 198 :
      name === "watch" ? 194 :
      188;
    addCommand(candidates.run, command, source, score, "known", scripts[name]);
    if (name === "dev" || name === "watch") {
      addCommand(candidates.dev, command, source, score, "known", scripts[name]);
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
  const tasks = new Set(
    Array.from(
      section.matchAll(/^([A-Za-z0-9_.-]+)\s*=/gm),
      (match) => match[1].split(".")[0]
    )
  );
  const prefix = fileMap.has("uv.lock") ? "uv run " : "";
  if (tasks.has("start")) {
    addCommand(candidates.run, `${prefix}poe start`, file.path, 220, "known");
  }
  if (tasks.has("test")) {
    addCommand(candidates.test, `${prefix}poe test`, file.path, 220, "known");
  }
}

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

export function detectPackageManager(files, packageJson) {
  const declared = String(packageJson?.packageManager || "").split("@")[0];
  if (["pnpm", "yarn", "npm", "bun"].includes(declared)) {
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
