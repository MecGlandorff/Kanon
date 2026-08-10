import { findByPath, readText } from "../scanner.js";
import { firstHeadingOrLine } from "./utils.js";

/**
 * @typedef {import("../scanner/read.js").ScannedFile} ScannedFile
 * @typedef {NonNullable<Parameters<typeof readText>[2]>} ReadOptions
 * @typedef {{
 *   path: string,
 *   json: Record<string, unknown> | null,
 *   name: string | null,
 *   description: string | null,
 *   scripts: Record<string, unknown>,
 *   evidence: string
 * }} PackageInfo
 * @typedef {{
 *   path: string,
 *   name: string | null,
 *   description: string | null,
 *   scripts: Record<string, string>,
 *   hasPytest: boolean,
 *   evidence: string
 * }} PyprojectInfo
 * @typedef {{
 *   path: string,
 *   evidence: string
 * }} EvidencePath
 * @typedef {{
 *   requirements: EvidencePath | null,
 *   pytestConfig: EvidencePath | null,
 *   mentionsPytest: boolean
 * }} PythonHints
 * @typedef {{
 *   path: string,
 *   description: string | null,
 *   evidence: string
 * }} SkillInfo
 * @typedef {{
 *   claim: string,
 *   confidence: "known" | "likely" | "unknown",
 *   evidence: string[],
 *   trust: "repository-untrusted" | "kanon-generated"
 * }} Purpose
 */

/**
 * @param {string} root
 * @param {ScannedFile[]} files
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @param {ReadOptions} [readOptions]
 * @returns {PackageInfo | null}
 */
export function readPackageJson(root, files, evidence, readOptions = {}) {
  const file = findByPath(files, "package.json");
  if (!file) {
    return null;
  }
  const text = readText(root, file.path, readOptions);
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      path: file.path,
      json: null,
      name: null,
      description: null,
      scripts: {},
      evidence: evidence.add(
        "config",
        file.path,
        "package.json exists but could not be parsed."
      )
    };
  }
  const json = plainRecord(parsed) ? parsed : null;
  const scripts = json && plainRecord(json.scripts) ? json.scripts : {};
  const name = json && typeof json.name === "string" ? json.name : null;
  const description = json && typeof json.description === "string"
    ? json.description
    : null;
  return {
    path: file.path,
    json,
    name,
    description,
    scripts,
    evidence: evidence.add(
      "config",
      file.path,
      `package.json declares package ${name || "(unnamed)"} with ${Object.keys(scripts).length} script(s).`,
      JSON.stringify({ name, scripts }) ?? ""
    )
  };
}

/**
 * @param {string} root
 * @param {ScannedFile[]} files
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @param {ReadOptions} [readOptions]
 * @returns {PyprojectInfo | null}
 */
export function readPyproject(root, files, evidence, readOptions = {}) {
  const file = findByPath(files, "pyproject.toml");
  if (!file) {
    return null;
  }
  const text = readText(root, file.path, readOptions);
  const hasPytest = /\[tool\.pytest\b/.test(text);
  return {
    path: file.path,
    name: findTomlString(text, "name"),
    description: findTomlString(text, "description"),
    scripts: parseTomlSection(text, "project.scripts"),
    hasPytest,
    evidence: evidence.add(
      "config",
      file.path,
      `pyproject.toml declares Python project metadata${hasPytest ? " and pytest configuration" : ""}.`,
      text.slice(0, 500)
    )
  };
}

/**
 * @param {string} root
 * @param {ScannedFile[]} files
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @param {ReadOptions} [readOptions]
 * @returns {PythonHints}
 */
export function readPythonHints(root, files, evidence, readOptions = {}) {
  /** @type {PythonHints} */
  const hints = {
    requirements: null,
    pytestConfig: null,
    mentionsPytest: false
  };
  for (const candidate of [
    "requirements.txt",
    "pytest.ini",
    "setup.cfg",
    "tox.ini"
  ]) {
    const file = findByPath(files, candidate);
    if (!file) {
      continue;
    }
    const text = readText(root, file.path, {
      ...readOptions,
      limit: 40_000
    });
    const id = evidence.add(
      "config",
      file.path,
      `${candidate} found.`,
      text.slice(0, 300)
    );
    if (candidate === "requirements.txt") {
      hints.requirements = { path: file.path, evidence: id };
      hints.mentionsPytest =
        /(^|\n)\s*pytest(?:[<>=~!;\s]|$)/i.test(text);
    } else if (/pytest/i.test(text)) {
      hints.pytestConfig = { path: file.path, evidence: id };
    }
  }
  return hints;
}

/**
 * @param {string} root
 * @param {ScannedFile[]} files
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @param {ReadOptions} [readOptions]
 * @returns {SkillInfo | null}
 */
export function readSkillInfo(root, files, evidence, readOptions = {}) {
  const file = findByPath(files, "SKILL.md");
  if (!file) {
    return null;
  }
  const text = readText(root, file.path, {
    ...readOptions,
    limit: 40_000
  });
  const description =
    text.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1] || null;
  return {
    path: file.path,
    description,
    evidence: evidence.add(
      "config",
      file.path,
      "SKILL.md found and used as declared-intent evidence.",
      description || ""
    )
  };
}

/**
 * @param {{
 *   readmeFile: ScannedFile | null,
 *   readmeText: string,
 *   readmeEvidence: string | null,
 *   packageInfo: PackageInfo | null,
 *   pyprojectInfo: PyprojectInfo | null,
 *   skillInfo: SkillInfo | null
 * }} input
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @returns {Purpose}
 */
export function detectPurpose(input, evidence) {
  const {
    readmeFile,
    readmeText,
    readmeEvidence,
    packageInfo,
    pyprojectInfo,
    skillInfo
  } = input;
  if (packageInfo?.description) {
    return {
      claim: packageInfo.description,
      confidence: "likely",
      evidence: [packageInfo.evidence],
      trust: "repository-untrusted"
    };
  }
  if (pyprojectInfo?.description) {
    return {
      claim: pyprojectInfo.description,
      confidence: "likely",
      evidence: [pyprojectInfo.evidence],
      trust: "repository-untrusted"
    };
  }
  if (readmeFile && readmeText) {
    const excerpt = firstHeadingOrLine(readmeText);
    const id =
      readmeEvidence ||
      evidence.add(
        "file",
        readmeFile.path,
        "README used to infer declared repo purpose.",
        excerpt
      );
    return {
      claim: excerpt || `Declared in ${readmeFile.path}`,
      confidence: "likely",
      evidence: [id],
      trust: "repository-untrusted"
    };
  }
  if (skillInfo?.description) {
    return {
      claim: skillInfo.description,
      confidence: "likely",
      evidence: [skillInfo.evidence],
      trust: "repository-untrusted"
    };
  }
  return {
    claim: "No README or package metadata found to describe the repo purpose.",
    confidence: "unknown",
    evidence: [],
    trust: "kanon-generated"
  };
}

/**
 * @param {string} text
 * @param {string} section
 * @returns {Record<string, string>}
 */
function parseTomlSection(text, section) {
  const header = `[${section}]`;
  /** @type {Record<string, string>} */
  const entries = {};
  let active = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[.+\]$/.test(trimmed)) {
      active = trimmed === header;
      continue;
    }
    if (!active) {
      continue;
    }
    const item = line.match(
      /^\s*([A-Za-z0-9_.-]+)\s*=\s*["']([^"']+)["']/
    );
    if (item?.[1] && item[2]) {
      entries[item[1]] = item[2];
    }
  }
  return entries;
}

/**
 * @param {string} text
 * @param {string} key
 * @returns {string | null}
 */
function findTomlString(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(
    new RegExp(`^\\s*${escaped}\\s*=\\s*["']([^"']+)["']`, "m")
  )?.[1] || null;
}

/**
 * JSON.parse produces data properties, but callers still receive a validated
 * record rather than an unchecked array or primitive root.
 *
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
