import path from "node:path";
import { readText } from "../scanner.js";

const CODE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".go",
  ".java",
  ".js",
  ".jsx",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue"
]);

const CONFIG_EXTENSIONS = new Set([
  ".json",
  ".toml",
  ".yaml",
  ".yml",
  ".ini",
  ".cfg",
  ".conf"
]);
const TEST_PATH = /(^|\/)(test|tests|__tests__)\//;
const TEST_NAME = /\.(test|spec)\.[cm]?[jt]sx?$|test_.*\.py$|_test\.py$/;

export function collectFileMetrics(root, files) {
  const metrics = [];
  const allTexts = new Map();

  for (const file of files) {
    if (!file.text) {
      continue;
    }
    const kind = classifyFile(file);
    const text = readText(root, file.path, { limit: 300_000 });
    allTexts.set(file.path, text);
    metrics.push(analyzeFile(file, text, kind));
  }

  const referenceIndex = buildReferenceIndex(metrics, allTexts);
  for (const metric of metrics) {
    metric.reference_count = referenceIndex.get(metric.path) || 0;
  }

  return metrics;
}

function analyzeFile(file, text, kind) {
  const lines = text.split(/\r?\n/);
  const nonBlank = lines.filter((line) => line.trim()).length;
  const normalizedLines = lines.map(normalizeCodeLine).filter(Boolean);
  const duplicateLines =
    normalizedLines.length - new Set(normalizedLines).size;
  const functionLike = countMatches(
    text,
    functionPattern(file.extension)
  );
  const branchCount = countMatches(
    text,
    /\b(if|else if|for|while|switch|case|catch|try)\b|&&|\|\|/g
  );
  const exportCount = countMatches(
    text,
    /\bexport\b|module\.exports|exports\./g
  );
  const importCount = countMatches(
    text,
    /\bimport\b|\brequire\s*\(|\bfrom\s+[A-Za-z0-9_.]+\s+import\b/g
  );
  const todoCount = countWorkMarkers(lines);
  const longLines = lines.filter((line) => line.length > 120).length;
  const vagueNames = countMatches(
    text,
    /\b(doStuff|handleStuff|processData|someData|tempData|thing|things|stuff|misc|utils?)\b/g
  );

  return {
    path: file.path,
    basename: file.basename,
    extension: file.extension,
    size: file.size,
    kind,
    lines: lines.length,
    non_blank_lines: nonBlank,
    duplicate_lines: duplicateLines,
    duplicate_ratio: normalizedLines.length
      ? duplicateLines / normalizedLines.length
      : 0,
    function_like_count: functionLike,
    branch_count: branchCount,
    export_count: exportCount,
    import_count: importCount,
    todo_count: todoCount,
    long_lines: longLines,
    vague_name_count: vagueNames,
    reference_count: 0
  };
}

function classifyFile(file) {
  if (TEST_PATH.test(file.path) || TEST_NAME.test(file.path)) {
    return "test";
  }
  if (
    CODE_EXTENSIONS.has(file.extension) ||
    file.basename === "Makefile"
  ) {
    return "source";
  }
  if (
    CONFIG_EXTENSIONS.has(file.extension) ||
    ["Dockerfile", "Procfile"].includes(file.basename)
  ) {
    return "config";
  }
  if (file.extension === ".md" || file.extension === ".txt") {
    return "docs";
  }
  return "other";
}

function buildReferenceIndex(metrics, allTexts) {
  const index = new Map();
  for (const metric of metrics) {
    if (metric.kind !== "source") {
      continue;
    }
    const stem = path.basename(
      metric.path,
      metric.extension
    ).toLowerCase();
    if (!stem || stem.length < 4) {
      continue;
    }
    let count = 0;
    for (const [filePath, text] of allTexts.entries()) {
      if (filePath === metric.path) {
        continue;
      }
      if (text.toLowerCase().includes(stem)) {
        count += 1;
      }
    }
    index.set(metric.path, count);
  }
  return index;
}

function normalizeCodeLine(line) {
  const trimmed = line.trim();
  if (
    !trimmed ||
    trimmed.length < 24 ||
    /^\/\/|^#|^\/\*|^\*|^<!--/.test(trimmed)
  ) {
    return "";
  }
  return trimmed.replace(/\s+/g, " ");
}

function functionPattern(extension) {
  if (extension === ".py") {
    return /^\s*(def|class)\s+[A-Za-z0-9_]+/gm;
  }
  if (
    [".js", ".jsx", ".mjs", ".ts", ".tsx"].includes(extension)
  ) {
    return /\b(function|class)\s+[A-Za-z0-9_$]+|=>/g;
  }
  return /\b(function|class|def|fn)\b/g;
}

function countMatches(text, pattern) {
  return [...String(text || "").matchAll(pattern)].length;
}

function countWorkMarkers(lines) {
  return lines.filter(
    (line) =>
      /(?:^|\s)(?:\/\/|#|\/\*|\*)\s*\b(TODO|FIXME|HACK|XXX)\b(?::|\s)/i.test(
        line
      ) ||
      /^\s*-\s*\b(TODO|FIXME|HACK|XXX)\b(?::|\s)/i.test(line)
  ).length;
}
