import { fileExists, readText } from "../scanner.js";
import { uniqueClaims } from "./utils.js";

/**
 * @typedef {import("../scanner/read.js").ScannedFile} ScannedFile
 * @typedef {import("./metadata.js").PackageInfo} PackageInfo
 * @typedef {import("./metadata.js").PyprojectInfo} PyprojectInfo
 * @typedef {{
 *   claim: string,
 *   confidence: "known" | "likely" | "unknown",
 *   evidence: string[]
 * }} EntrypointClaim
 * @typedef {{
 *   path: string,
 *   line: number,
 *   text: string
 * }} TodoObservation
 */

/**
 * @param {ScannedFile[]} files
 * @param {PackageInfo | null} packageInfo
 * @param {PyprojectInfo | null} pyprojectInfo
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @param {ReturnType<typeof import("../code-intel.js").inspectRepoCode>}
 *   codeIntel
 * @returns {EntrypointClaim[]}
 */
export function detectEntrypoints(
  files,
  packageInfo,
  pyprojectInfo,
  evidence,
  codeIntel
) {
  /** @type {EntrypointClaim[]} */
  const entrypoints = codeIntel.entrypoints.slice(0, 10).map((item) => ({
    claim: `${item.path} is an executable entrypoint (${item.reason}).`,
    confidence: item.confidence === "known" ? "known" : "likely",
    evidence: [
      evidence.add(
        "file",
        item.path,
        `Entrypoint detected from file content: ${item.reason}.`
      )
    ]
  }));
  /** @type {string[]} */
  const packageEntrypoints = [];
  const packageJson = packageInfo?.json;
  if (packageInfo && packageJson) {
    for (const value of [
      packageJson.bin,
      packageJson.main,
      packageJson.module
    ]) {
      if (typeof value === "string") {
        packageEntrypoints.push(value);
      }
    }
    if (plainRecord(packageJson.bin)) {
      packageEntrypoints.push(
        ...Object.values(packageJson.bin).filter(
          (value) => typeof value === "string"
        )
      );
    }
  }
  if (packageInfo) {
    for (const relPath of packageEntrypoints) {
      const normalized = String(relPath).replace(/^\.\//, "");
      if (fileExists(files, normalized)) {
        entrypoints.push({
          claim: `${normalized} appears to be a package entrypoint.`,
          confidence: "known",
          evidence: [packageInfo.evidence]
        });
      }
    }
  }
  for (const relPath of [
    "src/cli.js",
    "src/index.js",
    "src/index.ts",
    "src/run.py",
    "src/main.py",
    "main.py"
  ]) {
    if (fileExists(files, relPath)) {
      entrypoints.push({
        claim: `${relPath} appears to be an entrypoint by convention.`,
        confidence: "likely",
        evidence: [
          evidence.add(
            "file",
            relPath,
            "Likely entrypoint file found by convention."
          )
        ]
      });
    }
  }
  if (
    pyprojectInfo?.scripts &&
    Object.keys(pyprojectInfo.scripts).length > 0
  ) {
    entrypoints.push({
      claim: `pyproject.toml exposes CLI script(s): ${Object.keys(pyprojectInfo.scripts).join(", ")}.`,
      confidence: "known",
      evidence: [pyprojectInfo.evidence]
    });
  }
  return uniqueClaims(entrypoints).slice(0, 8);
}

/**
 * @param {string} root
 * @param {ScannedFile[]} files
 * @param {NonNullable<Parameters<typeof readText>[2]>} [readOptions]
 * @returns {TodoObservation[]}
 */
export function detectTodos(root, files, readOptions = {}) {
  /** @type {TodoObservation[]} */
  const todos = [];
  for (const file of files) {
    if (!file.text || todos.length >= 40) {
      continue;
    }
    if (
      !/\.(js|jsx|mjs|ts|tsx|py|md|toml|yaml|yml|json|sh)$/i.test(
        file.path
      )
    ) {
      continue;
    }
    const lines = readText(root, file.path, {
      ...readOptions,
      limit: 120_000,
      recordTruncation: false
    })
      .split(/\r?\n/);
    lines.forEach((line, index) => {
      if (todos.length < 40 && isTodoLine(line)) {
        todos.push({
          path: file.path,
          line: index + 1,
          text: line.trim().slice(0, 180)
        });
      }
    });
  }
  return todos;
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isTodoLine(line) {
  return (
    /(?:^|\s)(?:\/\/|#|\/\*|\*)\s*\b(TODO|FIXME)\b(?::|\s)/i.test(line) ||
    /^\s*-\s*\b(TODO|FIXME)\b(?::|\s)/i.test(line)
  );
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function plainRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
