import path from "node:path";
import { types as nodeTypes } from "node:util";
import {
  addSignal,
  getText,
  normalizeRelPath,
  parseBuildTargets,
  parseCargoBinPaths
} from "./shared.js";

/**
 * @typedef {import("./shared.js").CodeSignal} CodeSignal
 * @typedef {import("./shared.js").TextCache} TextCache
 * @typedef {{path: string, basename: string}} CodeFile
 * @typedef {Map<string, CodeFile>} FileMap
 * @typedef {Map<string, CodeSignal[]>} SignalMap
 * @typedef {[string, "binary" | "export", string | null]} PackageTarget
 */

/**
 * @param {string} relPath
 * @param {string} text
 * @returns {CodeSignal | null}
 */
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

/**
 * @param {string} root
 * @param {FileMap} fileMap
 * @param {TextCache} texts
 * @param {SignalMap} signals
 * @param {unknown} packageJson
 * @returns {void}
 */
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
  addRootTaskDeclarations(root, fileMap, texts, signals);
  addDjangoDeclarations(root, fileMap, texts, signals);
}

/**
 * @param {string} root
 * @param {FileMap} fileMap
 * @param {TextCache} texts
 * @param {SignalMap} signals
 * @returns {void}
 */
function addRootTaskDeclarations(root, fileMap, texts, signals) {
  for (const filePath of [
    "Makefile",
    "makefile",
    "GNUmakefile",
    "Justfile",
    "justfile"
  ]) {
    if (
      !fileMap.has(filePath) ||
      parseBuildTargets(
        getText(root, filePath, texts, 180_000)
      ).size === 0
    ) {
      continue;
    }
    addSignal(signals, filePath, {
      type: "declaration",
      source: "manifest",
      confidence: "known",
      score: 90,
      reason: "declared root task contract"
    });
  }
}

/**
 * @param {string} root
 * @param {FileMap} fileMap
 * @param {TextCache} texts
 * @param {SignalMap} signals
 * @param {unknown} rootPackageJson
 * @returns {void}
 */
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
    /** @type {unknown} */
    let manifest = directory === "." ? rootPackageJson : null;
    if (!manifest) {
      try {
        manifest = JSON.parse(getText(root, file.path, texts, 240_000));
      } catch {
        continue;
      }
    }
    for (const [target, kind, commandAlias] of packageTargets(manifest)) {
      const resolved = resolveManifestTarget(
        directory,
        target,
        fileMap,
        kind === "binary"
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
            : "declared package export",
        ...(commandAlias ? { command_alias: commandAlias } : {}),
        declaration_path: file.path
      });
    }
  }
}

/**
 * @param {string} root
 * @param {FileMap} fileMap
 * @param {TextCache} texts
 * @param {SignalMap} signals
 * @returns {void}
 */
function addCargoManifestTargets(root, fileMap, texts, signals) {
  /** @type {{directory: string, text: string, packageName: string | null}[]} */
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
  /** @type {Map<string, string>} */
  const libraries = new Map();
  for (const item of manifests) {
    if (!item.packageName) {
      continue;
    }
    const target = normalizeRelPath(
      item.directory === "."
        ? "src/lib.rs"
        : path.posix.join(item.directory, "src/lib.rs")
    );
    if (fileMap.has(target)) {
      libraries.set(item.packageName, target);
    }
  }
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

/**
 * @param {string} root
 * @param {FileMap} fileMap
 * @param {TextCache} texts
 * @param {SignalMap} signals
 * @returns {void}
 */
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
    const settings = resolvePythonModule(
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
    addSignal(signals, settings, {
      type: "declaration",
      source: "framework",
      confidence: "known",
      score: 105,
      reason: "declared Django settings module"
    });
    for (const candidate of [settings, inheritedPath]) {
      if (!candidate) {
        continue;
      }
      const effectiveText = getText(root, candidate, texts, 240_000);
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
}

/**
 * @param {unknown} manifest
 * @returns {PackageTarget[]}
 */
function packageTargets(manifest) {
  if (!plainRecord(manifest)) {
    return [];
  }
  /** @type {PackageTarget[]} */
  const output = [];
  const bin = manifest.bin;
  if (typeof bin === "string") {
    const name =
      typeof manifest.name === "string"
        ? manifest.name.split("/").pop() || null
        : null;
    output.push([bin, "binary", name]);
  } else if (plainRecord(bin)) {
    for (const [name, target] of Object.entries(bin)) {
      if (typeof target === "string") {
        output.push([target, "binary", name]);
      }
    }
  }
  for (const field of ["main", "module", "types"]) {
    if (typeof manifest[field] === "string") {
      output.push([manifest[field], "export", null]);
    }
  }
  collectExportStrings(manifest.exports, output);
  return output;
}

/**
 * @param {unknown} value
 * @param {PackageTarget[]} output
 * @param {number} [depth]
 * @param {{entries: number}} [budget]
 * @returns {void}
 */
function collectExportStrings(
  value,
  output,
  depth = 0,
  budget = { entries: 0 }
) {
  if (depth > 16 || budget.entries >= 256) {
    return;
  }
  if (typeof value === "string") {
    output.push([value, "export", null]);
    budget.entries += 1;
  } else if (plainRecord(value)) {
    for (const nested of Object.values(value)) {
      collectExportStrings(nested, output, depth + 1, budget);
    }
  }
}

/**
 * @param {string} directory
 * @param {unknown} target
 * @param {FileMap} fileMap
 * @param {boolean} [binary]
 * @returns {string | null}
 */
function resolveManifestTarget(
  directory,
  target,
  fileMap,
  binary = false
) {
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
      (
        /\.(?:[cm]?[jt]sx?|d\.ts)$/.test(candidate) ||
        (binary && candidate === base)
      )
  ) || null;
}

/**
 * @param {string} directory
 * @param {string | null | undefined} moduleName
 * @param {FileMap} fileMap
 * @returns {string | null}
 */
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
