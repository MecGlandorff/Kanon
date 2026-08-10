import { readText } from "../scanner.js";

/**
 * @typedef {import("../scanner/read.js").ScannedFile} ScannedFile
 * @typedef {import("./metadata.js").PackageInfo} PackageInfo
 * @typedef {import("./metadata.js").PyprojectInfo} PyprojectInfo
 * @typedef {import("./metadata.js").PythonHints} PythonHints
 * @typedef {{
 *   found: boolean,
 *   files: {path: string, evidence: string}[]
 * }} ProjectSignal
 * @typedef {{
 *   found: boolean,
 *   files: string[],
 *   count: number,
 *   frameworks: string[],
 *   evidence: string[]
 * }} TestSignal
 */

/**
 * @param {ScannedFile[]} files
 * @param {PackageInfo | null} packageInfo
 * @param {PyprojectInfo | null} pyprojectInfo
 * @returns {string[]}
 */
export function detectLanguages(files, packageInfo, pyprojectInfo) {
  /** @type {Set<string>} */
  const languages = new Set();
  if (
    packageInfo ||
    files.some((file) =>
      [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"].includes(file.extension)
    )
  ) {
    languages.add("JavaScript/TypeScript");
  }
  if (pyprojectInfo || files.some((file) => file.extension === ".py")) {
    languages.add("Python");
  }
  if (files.some((file) => file.extension === ".go")) {
    languages.add("Go");
  }
  if (files.some((file) => file.extension === ".rs")) {
    languages.add("Rust");
  }
  return Array.from(languages);
}

/**
 * @param {ScannedFile[]} files
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @returns {ProjectSignal}
 */
export function detectCi(files, evidence) {
  const matches = files.filter(
    (file) =>
      /^\.github\/workflows\/[^/]+\.(ya?ml)$/.test(file.path) ||
      file.path === ".gitlab-ci.yml" ||
      file.path === "circle.yml" ||
      /^\.circleci\/config\.ya?ml$/.test(file.path)
  );
  return evidenceFiles(matches, evidence, "config", "CI configuration found.");
}

/**
 * @param {ScannedFile[]} files
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @returns {ProjectSignal}
 */
export function detectDeployment(files, evidence) {
  const patterns = [
    /^Dockerfile$/,
    /^docker-compose\.ya?ml$/,
    /^compose\.ya?ml$/,
    /^fly\.toml$/,
    /^vercel\.json$/,
    /^netlify\.toml$/,
    /^render\.ya?ml$/,
    /^railway\.json$/,
    /^Procfile$/
  ];
  const matches = files.filter((file) =>
    patterns.some((pattern) => pattern.test(file.path))
  );
  return evidenceFiles(
    matches,
    evidence,
    "config",
    "Deployment/runtime configuration found."
  );
}

/**
 * @param {string} root
 * @param {ScannedFile[]} files
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @param {NonNullable<Parameters<typeof readText>[2]>} [readOptions]
 * @returns {ProjectSignal}
 */
export function detectRelease(root, files, evidence, readOptions = {}) {
  const matches = files.filter((file) => {
    if (
      /^\.github\/workflows\/.*release.*\.(ya?ml)$/.test(file.path) ||
      /^CHANGELOG\.md$/i.test(file.path) ||
      /^\.releaserc/.test(file.path)
    ) {
      return true;
    }
    if (!/^\.github\/workflows\/[^/]+\.(ya?ml)$/.test(file.path)) {
      return false;
    }
    return hasReleaseWorkflowSignal(
      readText(root, file.path, {
        ...readOptions,
        limit: 180_000
      })
    );
  });
  return evidenceFiles(
    matches,
    evidence,
    "file",
    "Release/changelog evidence found."
  );
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function hasReleaseWorkflowSignal(text) {
  return (
    /\brefs\/tags\//.test(text) ||
    (
      /(?:^|\n)\s*push:\s*(?:\n|$)/m.test(text) &&
      /(?:^|\n)\s*tags:\s*(?:\n|$)/m.test(text)
    ) ||
    /\b(?:npm publish|gh release)\b/.test(text) ||
    /\b(?:action-gh-release|release-drafter)\b/i.test(text)
  );
}

/**
 * @param {ScannedFile[]} files
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @param {PackageInfo | null} packageInfo
 * @param {PyprojectInfo | null} pyprojectInfo
 * @param {PythonHints | null} pythonInfo
 * @returns {TestSignal}
 */
export function detectTests(
  files,
  evidence,
  packageInfo,
  pyprojectInfo,
  pythonInfo
) {
  const testFiles = files.filter(
    (file) =>
      /(^|\/)(test|tests|__tests__)\//.test(file.path) ||
      /\.(test|spec)\.[cm]?[jt]sx?$/.test(file.path) ||
      /test_.*\.py$/.test(file.path) ||
      /_test\.py$/.test(file.path)
  );
  /** @type {string[]} */
  const testEvidence = [];
  if (testFiles.length > 0) {
    const firstTest = testFiles[0];
    if (!firstTest) {
      throw new Error("Test-file selection changed unexpectedly.");
    }
    testEvidence.push(
      evidence.add(
        "test",
        firstTest.path,
        `${testFiles.length} test-like file(s) found.`,
        testFiles.slice(0, 12).map((file) => file.path).join(", ")
      )
    );
  }
  const hasPytest =
    Boolean(pyprojectInfo?.hasPytest) ||
    Boolean(pythonInfo?.pytestConfig) ||
    Boolean(pythonInfo?.mentionsPytest);
  const hasPackageTest =
    typeof packageInfo?.scripts.test === "string" &&
    !/(?:no test specified|not implemented|exit\s+1)/i.test(
      packageInfo.scripts.test
    );
  return {
    found: testFiles.length > 0 || hasPackageTest || hasPytest,
    files: testFiles.slice(0, 50).map((file) => file.path),
    count: testFiles.length,
    frameworks: [
      ...(hasPackageTest ? ["package test script"] : []),
      ...(hasPytest ? ["pytest"] : [])
    ],
    evidence: testEvidence
  };
}

/**
 * @param {ScannedFile[]} matches
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @param {string} kind
 * @param {string} claim
 * @returns {ProjectSignal}
 */
function evidenceFiles(matches, evidence, kind, claim) {
  return {
    found: matches.length > 0,
    files: matches.map((file) => ({
      path: file.path,
      evidence: evidence.add(kind, file.path, claim)
    }))
  };
}
