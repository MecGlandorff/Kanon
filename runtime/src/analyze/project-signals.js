import { readText } from "../scanner.js";

export function detectLanguages(files, packageInfo, pyprojectInfo) {
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
  const testEvidence = [];
  if (testFiles.length > 0) {
    testEvidence.push(
      evidence.add(
        "test",
        testFiles[0].path,
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
    Boolean(packageInfo?.scripts?.test) &&
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

function evidenceFiles(matches, evidence, kind, claim) {
  return {
    found: matches.length > 0,
    files: matches.map((file) => ({
      path: file.path,
      evidence: evidence.add(kind, file.path, claim)
    }))
  };
}
