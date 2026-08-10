import path from "node:path";
import { JS_EXTENSIONS } from "./constants.js";
import { getText, normalizeRelPath, unique } from "./shared.js";

/** @typedef {Map<string, {path: string}>} FileMap */

/**
 * @param {string} relPath
 * @param {string} text
 * @returns {string[]}
 */
export function extractImports(relPath, text) {
  const extension = path.posix.extname(relPath).toLowerCase();
  /** @type {string[]} */
  const imports = [];
  if (extension === ".py") {
    for (const match of text.matchAll(/^\s*from\s+([.\w]+)\s+import\b/gm)) {
      if (match[1]) imports.push(match[1]);
    }
    for (const match of text.matchAll(/^\s*import\s+([A-Za-z_][\w.]*)/gm)) {
      if (match[1]) imports.push(match[1]);
    }
  } else if (JS_EXTENSIONS.includes(extension)) {
    for (const match of text.matchAll(
      /\b(?:import|export)\s+(?:[^"'()]+?\s+from\s+)?["']([^"']+)["']/g
    )) {
      if (match[1]) imports.push(match[1]);
    }
    for (const match of text.matchAll(
      /\b(?:require|import)\(\s*["']([^"']+)["']\s*\)/g
    )) {
      if (match[1]) imports.push(match[1]);
    }
  } else if (extension === ".go") {
    for (const block of text.matchAll(/\bimport\s*\(([\s\S]*?)\)/g)) {
      for (const match of (block[1] ?? "").matchAll(
        /["']([^"']+)["']/g
      )) {
        if (match[1]) imports.push(match[1]);
      }
    }
    for (const match of text.matchAll(
      /\bimport\s+(?:\w+\s+)?["']([^"']+)["']/g
    )) {
      if (match[1]) imports.push(match[1]);
    }
  } else if (extension === ".rs") {
    for (const match of text.matchAll(
      /\b(?:use|mod)\s+(?:crate::|self::|super::)?([A-Za-z_][\w:]*)/g
    )) {
      if (match[1]) imports.push(match[1].replaceAll("::", "/"));
    }
  }
  return imports;
}

/**
 * @param {string} importer
 * @param {string} specifier
 * @param {FileMap} fileMap
 * @param {string | null} goModule
 * @returns {string | null}
 */
export function resolveImport(importer, specifier, fileMap, goModule) {
  const extension = path.posix.extname(importer).toLowerCase();
  if (extension === ".py") {
    return resolvePythonImport(importer, specifier, fileMap);
  }
  if (JS_EXTENSIONS.includes(extension)) {
    if (!specifier.startsWith(".")) {
      return null;
    }
    return resolveModuleCandidate(
      normalizeRelPath(path.posix.join(path.posix.dirname(importer), specifier)),
      fileMap,
      JS_EXTENSIONS
    );
  }
  if (extension === ".go" && goModule && specifier.startsWith(`${goModule}/`)) {
    return packageRepresentative(specifier.slice(goModule.length + 1), fileMap, ".go");
  }
  if (extension === ".rs") {
    return resolveModuleCandidate(
      normalizeRelPath(path.posix.join(path.posix.dirname(importer), specifier)),
      fileMap,
      [".rs"]
    );
  }
  return null;
}

/**
 * @param {string} importer
 * @param {string} text
 * @param {FileMap} fileMap
 * @returns {string[]}
 */
export function extractFileReferences(importer, text, fileMap) {
  /** @type {string[]} */
  const output = [];
  for (const match of text.matchAll(
    /["'`]([^"'`\n]{1,160}\.[A-Za-z0-9]{1,8})["'`]/g
  )) {
    const raw = match[1];
    if (!raw) {
      continue;
    }
    if (/^(?:https?:|data:|[A-Za-z]+:)/.test(raw) || /[{*]/.test(raw)) {
      continue;
    }
    const candidates = [
      normalizeRelPath(raw.replace(/^\.\//, "")),
      normalizeRelPath(path.posix.join(path.posix.dirname(importer), raw))
    ];
    const target = candidates.find((candidate) => fileMap.has(candidate));
    if (target) {
      output.push(target);
    }
  }
  return unique(output);
}

/**
 * @param {string} root
 * @param {FileMap} fileMap
 * @param {import("./shared.js").TextCache} texts
 * @returns {string | null}
 */
export function readGoModule(root, fileMap, texts) {
  const file = fileMap.get("go.mod");
  if (!file) {
    return null;
  }
  return getText(root, file.path, texts, 40_000)
    .match(/^\s*module\s+(\S+)/m)?.[1] || null;
}

/**
 * @param {string} importer
 * @param {string} specifier
 * @param {FileMap} fileMap
 * @returns {string | null}
 */
function resolvePythonImport(importer, specifier, fileMap) {
  let base = "";
  let module = specifier;
  if (specifier.startsWith(".")) {
    const dots = specifier.match(/^\.+/)?.[0].length ?? 0;
    base = path.posix.dirname(importer);
    for (let index = 1; index < dots; index += 1) {
      base = path.posix.dirname(base);
    }
    module = specifier.slice(dots);
  }
  const modulePath = module.replaceAll(".", "/");
  const direct = resolveModuleCandidate(
    normalizeRelPath(path.posix.join(base, modulePath)),
    fileMap,
    [".py"]
  );
  if (direct || specifier.startsWith(".")) {
    return direct;
  }
  return resolveModuleCandidate(
    normalizeRelPath(path.posix.join(path.posix.dirname(importer), modulePath)),
    fileMap,
    [".py"]
  );
}

/**
 * @param {string} base
 * @param {FileMap} fileMap
 * @param {string[]} extensions
 * @returns {string | null}
 */
function resolveModuleCandidate(base, fileMap, extensions) {
  const candidates = [base];
  for (const extension of extensions) {
    candidates.push(`${base}${extension}`, `${base}/index${extension}`);
    if (extension === ".py") {
      candidates.push(`${base}/__init__.py`);
    }
    if (extension === ".rs") {
      candidates.push(`${base}/mod.rs`);
    }
  }
  return candidates.find((candidate) => fileMap.has(candidate)) || null;
}

/**
 * @param {string} directory
 * @param {FileMap} fileMap
 * @param {string} extension
 * @returns {string | null}
 */
function packageRepresentative(directory, fileMap, extension) {
  const basename = path.posix.basename(directory);
  const candidates = ["app", "server", "core", "main", "root", "api", "doc"]
    .map((name) => `${directory}/${name}${extension}`);
  candidates.unshift(`${directory}/${basename}${extension}`);
  const exact = candidates.find((candidate) => fileMap.has(candidate));
  if (exact) {
    return exact;
  }
  return Array.from(fileMap.keys())
    .filter(
      (filePath) =>
        path.posix.dirname(filePath) === directory &&
        filePath.endsWith(extension) &&
        !filePath.endsWith(`_test${extension}`)
    )
    .sort()[0] || null;
}
