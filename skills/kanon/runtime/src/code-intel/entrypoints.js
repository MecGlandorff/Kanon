import path from "node:path";
import { addSignal, getText, normalizeRelPath, parseCargoBinPaths } from "./shared.js";

export function detectEntrypointSignal(relPath, text) {
  const extension = path.posix.extname(relPath).toLowerCase();
  if (
    extension === ".py" &&
    /if\s+__name__\s*==\s*["']__main__["']\s*:/.test(text)
  ) {
    const framework =
      /execute_from_command_line/.test(text) ? "Django executable" :
      /\b(?:argparse|click|typer)\b/.test(text) ? "Python CLI" :
      "executable Python module";
    return {
      type: "entrypoint",
      confidence: "known",
      score: 62,
      reason: `${framework} guarded by __main__`
    };
  }
  if (
    extension === ".go" &&
    /^\s*package\s+main\b/m.test(text) &&
    /\bfunc\s+main\s*\(/.test(text)
  ) {
    return {
      type: "entrypoint",
      confidence: "known",
      score: 72,
      reason: "Go package main with func main"
    };
  }
  if (
    extension === ".rs" &&
    /(?:^|\/)src\/(?:bin\/[^/]+\/)?main\.rs$/.test(relPath) &&
    /\bfn\s+main\s*\(\s*\)/.test(text)
  ) {
    return {
      type: "entrypoint",
      confidence: "known",
      score: 72,
      reason: "Rust binary main function"
    };
  }
  if (
    [".js", ".mjs", ".cjs", ".ts"].includes(extension) &&
    (/^#!.*\bnode\b/m.test(text) || /\b(?:parseArgs|Command|commander|yargs)\b/.test(text))
  ) {
    const executable = /^#!.*\bnode\b/m.test(text);
    return {
      type: "entrypoint",
      confidence: executable ? "known" : "likely",
      score: executable ? 75 : 45,
      reason: executable ? "executable Node script" : "JavaScript CLI signals"
    };
  }
  return null;
}

export function addManifestEntrypoints(
  root,
  fileMap,
  texts,
  signals,
  packageJson
) {
  addPackageManifestTargets(
    root,
    fileMap,
    texts,
    signals,
    packageJson
  );
  addCargoManifestTargets(root, fileMap, texts, signals);
  addDjangoDeclarations(root, fileMap, texts, signals);
}

function addPackageManifestTargets(
  root,
  fileMap,
  texts,
  signals,
  rootPackageJson
) {
  for (const file of fileMap.values()) {
    if (file.basename !== "package.json") {
      continue;
    }
    const directory = path.posix.dirname(file.path);
    if (
      /(?:^|\/)(?:examples?|fixtures?|testdata|tests?|suites)(?:\/|$)/.test(
        directory
      )
    ) {
      continue;
    }
    let manifest = directory === "." ? rootPackageJson : null;
    if (!manifest) {
      try {
        manifest = JSON.parse(getText(root, file.path, texts, 240_000));
      } catch {
        continue;
      }
    }
    for (const [target, kind] of packageTargets(manifest)) {
      const resolved = resolveManifestTarget(
        directory,
        target,
        fileMap
      );
      if (!resolved) {
        continue;
      }
      addSignal(signals, resolved, {
        type: kind === "binary" ? "entrypoint" : "declaration",
        source: "manifest",
        confidence: "known",
        score: kind === "binary" ? 110 : 96,
        reason:
          kind === "binary"
            ? "declared package binary"
            : "declared package export"
      });
    }
  }
}

function addCargoManifestTargets(root, fileMap, texts, signals) {
  const manifests = [];
  for (const file of fileMap.values()) {
    if (file.basename !== "Cargo.toml") {
      continue;
    }
    const directory = path.posix.dirname(file.path);
    const text = getText(root, file.path, texts, 240_000);
    const packageName = text.match(
      /\[package\][\s\S]*?^\s*name\s*=\s*["']([^"']+)["']/m
    )?.[1] || null;
    manifests.push({ directory, text, packageName });
    const scopedMap = new Map();
    for (const [filePath, value] of fileMap) {
      if (directory === "." || filePath.startsWith(`${directory}/`)) {
        const scoped =
          directory === "."
            ? filePath
            : filePath.slice(directory.length + 1);
        scopedMap.set(scoped, value);
      }
    }
    const binaryTargets = parseCargoBinPaths(text, scopedMap);
    for (const target of binaryTargets) {
      const resolved = normalizeRelPath(
        directory === "." ? target : path.posix.join(directory, target)
      );
      addSignal(signals, resolved, {
        type: "entrypoint",
        source: "manifest",
        confidence: "known",
        score: 110,
        reason: "declared Cargo binary"
      });
    }
    const defaultLibrary = normalizeRelPath(
      directory === "."
        ? "src/lib.rs"
        : path.posix.join(directory, "src/lib.rs")
    );
    if (/\[package\]/.test(text) && fileMap.has(defaultLibrary)) {
      addSignal(signals, defaultLibrary, {
        type: "declaration",
        source: "manifest",
        confidence: "known",
        score: 100,
        reason: "declared Cargo package library target"
      });
    }
  }
  const libraries = new Map(
    manifests
      .filter((item) => item.packageName)
      .map((item) => {
        const target = normalizeRelPath(
          item.directory === "."
            ? "src/lib.rs"
            : path.posix.join(item.directory, "src/lib.rs")
        );
        return [item.packageName, fileMap.has(target) ? target : null];
      })
      .filter(([, target]) => target)
  );
  for (const [packageName, target] of libraries) {
    const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `^\\s*${escaped.replaceAll("-", "[-_]")}\\s*(?:\\.workspace)?\\s*=`,
      "m"
    );
    const inbound = manifests.filter(
      (item) => item.packageName !== packageName && pattern.test(item.text)
    ).length;
    if (inbound > 0) {
      addSignal(signals, target, {
        type: "declaration",
        source: "manifest",
        confidence: "known",
        score: Math.min(
          90,
          Math.round(24 * Math.log2(inbound + 1))
        ),
        reason: `declared dependency of ${inbound} Cargo package(s)`
      });
    }
  }
}

function addDjangoDeclarations(root, fileMap, texts, signals) {
  for (const file of fileMap.values()) {
    if (file.basename !== "manage.py") {
      continue;
    }
    const text = getText(root, file.path, texts, 80_000);
    if (!/\bexecute_from_command_line\b/.test(text)) {
      continue;
    }
    addSignal(signals, file.path, {
      type: "declaration",
      source: "framework",
      confidence: "known",
      score: 112,
      reason: "declared Django management bootstrap"
    });
    const moduleName = text.match(
      /DJANGO_SETTINGS_MODULE["']?\s*,\s*["']([^"']+)["']/
    )?.[1];
    let settings = resolvePythonModule(
      path.posix.dirname(file.path),
      moduleName,
      fileMap
    );
    if (!settings) {
      continue;
    }
    const settingsText = getText(root, settings, texts, 200_000);
    const inherited = settingsText.match(
      /^\s*from\s+\.([A-Za-z_][\w.]*)\s+import\s+\*/m
    )?.[1];
    const inheritedPath = resolvePythonModule(
      path.posix.dirname(path.posix.dirname(settings)),
      inherited
        ? `${path.posix.basename(path.posix.dirname(settings))}.${inherited}`
        : null,
      fileMap
    );
    if (inheritedPath) {
      settings = inheritedPath;
    }
    addSignal(signals, settings, {
      type: "declaration",
      source: "framework",
      confidence: "known",
      score: 105,
      reason: "declared Django settings module"
    });
    const effectiveText = getText(root, settings, texts, 240_000);
    for (const match of effectiveText.matchAll(
      /^\s*(?:ROOT_URLCONF|ROOT_HOSTCONF)\s*=\s*["']([^"']+)["']/gm
    )) {
      const target = resolvePythonModule(
        path.posix.dirname(file.path),
        match[1],
        fileMap
      );
      if (target) {
        addSignal(signals, target, {
          type: "declaration",
          source: "framework",
          confidence: "known",
          score: 100,
          reason: "declared Django root routing module"
        });
      }
    }
  }
}

function packageTargets(manifest) {
  if (!manifest || typeof manifest !== "object") {
    return [];
  }
  const output = [];
  const bin = manifest.bin;
  if (typeof bin === "string") {
    output.push([bin, "binary"]);
  } else if (bin && typeof bin === "object") {
    for (const target of Object.values(bin)) {
      if (typeof target === "string") {
        output.push([target, "binary"]);
      }
    }
  }
  for (const field of ["main", "module", "types"]) {
    if (typeof manifest[field] === "string") {
      output.push([manifest[field], "export"]);
    }
  }
  collectExportStrings(manifest.exports, output);
  return output;
}

function collectExportStrings(value, output) {
  if (typeof value === "string") {
    output.push([value, "export"]);
  } else if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      collectExportStrings(nested, output);
    }
  }
}

function resolveManifestTarget(directory, target, fileMap) {
  if (typeof target !== "string" || target.includes("*")) {
    return null;
  }
  const base = normalizeRelPath(
    path.posix.join(directory, target.replace(/^\.\//, ""))
  );
  const candidates = [
    base,
    base.replace(/\.d\.ts$/, ".ts"),
    `${base}.js`,
    `${base}.ts`,
    `${base}/index.js`,
    `${base}/index.ts`
  ];
  return candidates.find(
    (candidate) =>
      fileMap.has(candidate) &&
      /\.(?:[cm]?[jt]sx?|d\.ts)$/.test(candidate)
  ) || null;
}

function resolvePythonModule(directory, moduleName, fileMap) {
  if (!moduleName || !/^[A-Za-z_][\w.]*$/.test(moduleName)) {
    return null;
  }
  const modulePath = moduleName.replaceAll(".", "/");
  const candidates = [
    `${modulePath}.py`,
    `${modulePath}/__init__.py`,
    normalizeRelPath(path.posix.join(directory, `${modulePath}.py`)),
    normalizeRelPath(path.posix.join(directory, modulePath, "__init__.py"))
  ];
  return candidates.find((candidate) => fileMap.has(candidate)) || null;
}
