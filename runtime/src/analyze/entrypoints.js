import { fileExists, readText } from "../scanner.js";
import { uniqueClaims } from "./utils.js";

export function detectEntrypoints(
  files,
  packageInfo,
  pyprojectInfo,
  evidence,
  codeIntel
) {
  const entrypoints = codeIntel.entrypoints.slice(0, 10).map((item) => ({
    claim: `${item.path} is an executable entrypoint (${item.reason}).`,
    confidence: item.confidence,
    evidence: [
      evidence.add(
        "file",
        item.path,
        `Entrypoint detected from file content: ${item.reason}.`
      )
    ]
  }));
  const packageEntrypoints = [
    packageInfo?.json?.bin &&
    typeof packageInfo.json.bin === "string"
      ? packageInfo.json.bin
      : null,
    packageInfo?.json?.main,
    packageInfo?.json?.module
  ].filter(Boolean);
  if (
    packageInfo?.json?.bin &&
    typeof packageInfo.json.bin === "object"
  ) {
    packageEntrypoints.push(...Object.values(packageInfo.json.bin));
  }
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

export function detectTodos(root, files, readOptions = {}) {
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

function isTodoLine(line) {
  return (
    /(?:^|\s)(?:\/\/|#|\/\*|\*)\s*\b(TODO|FIXME)\b(?::|\s)/i.test(line) ||
    /^\s*-\s*\b(TODO|FIXME)\b(?::|\s)/i.test(line)
  );
}
