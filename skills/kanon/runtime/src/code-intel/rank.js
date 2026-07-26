import path from "node:path";
import {
  GENERATED_FILE,
  LOW_VALUE_PATH
} from "./constants.js";
import { curateRankedFiles } from "./curate.js";
import { depth, unique } from "./shared.js";

export function rankImportantFiles(files, intel, context = {}) {
  const ranked = [];
  for (const file of files) {
    if (!file.text || GENERATED_FILE.test(file.path) || /\.map$/.test(file.path)) {
      continue;
    }
    const reasons = [];
    const signals = intel.signals.get(file.path) || [];
    const fanIn = intel.importers.get(file.path)?.size || 0;
    const referenceCount = intel.references.get(file.path)?.size || 0;
    let score = baseImportance(file.path, reasons);

    for (const signal of signals) {
      score += signal.score;
      reasons.push(signal.reason);
    }
    if (fanIn > 0) {
      score += Math.min(135, Math.round(24 * Math.log2(fanIn + 1)));
      reasons.push(`imported by ${fanIn} local file${fanIn === 1 ? "" : "s"}`);
    }
    if (referenceCount > 0) {
      score += Math.min(60, 12 * referenceCount);
      reasons.push(`referenced by ${referenceCount} local file${referenceCount === 1 ? "" : "s"}`);
    }
    if (LOW_VALUE_PATH.test(file.path)) {
      score -= 85;
    }
    if (/^\.github\/workflows\//.test(file.path)) {
      score -= 120;
    }
    if (/(^|\/)(tests?|__tests__)\//.test(file.path)) {
      score -= 18;
    }
    score -= Math.min(30, depth(file.path) * 4);
    ranked.push({
      path: file.path,
      score,
      fan_in: fanIn,
      referenced_by: referenceCount,
      signals,
      reasons: unique(reasons)
    });
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.fan_in - a.fan_in ||
      a.path.localeCompare(b.path)
  );
  return curateRankedFiles(ranked, context);
}

function baseImportance(relPath, reasons) {
  const lower = relPath.toLowerCase();
  const basename = path.posix.basename(lower);
  let score = 0;
  const exact = new Map([
    ["package.json", 138],
    ["pyproject.toml", 142],
    ["cargo.toml", 145],
    ["go.mod", 145],
    ["makefile", 132],
    ["justfile", 132],
    ["pnpm-workspace.yaml", 125],
    ["pnpm-workspace.yml", 125],
    ["turbo.json", 112],
    ["nx.json", 112],
    ["manage.py", 150],
    ["setup.py", 108],
    ["requirements.txt", 104]
  ]);
  if (!relPath.includes("/") && exact.has(lower)) {
    score += exact.get(lower);
    reasons.push("root project/build metadata");
  }
  if (/^readme(?:\.[^.]+)?$/i.test(basename)) {
    score += relPath.includes("/") ? 12 : 136;
    reasons.push(relPath.includes("/") ? "component README" : "root README");
  }
  if (/^packages\/[^/]+\/package\.json$/.test(lower)) {
    score += 72;
    reasons.push("workspace package metadata");
  }
  if (/^packages\/[^/]+\/src\/index\.[^.]+$/.test(lower)) {
    score += 78;
    reasons.push("workspace public entry module");
  }
  if (/^(?:src\/)?(?:main|index|cli|app|server|run)\.[^.]+$/.test(lower)) {
    score += 48;
    reasons.push("conventional entry file");
  }
  if (
    /(^|\/)(model|engine|tensor|ops|core|settings|urls|router|commands?|trainer|backend|search|controller|lib)\.[^.]+$/.test(
      lower
    )
  ) {
    score += 44;
    reasons.push("central implementation filename");
  }
  if (/(^|\/)(test[^/]*|[^/]+\.(?:test|spec))\.[^.]+$/.test(lower)) {
    score += 30;
    reasons.push("test-suite anchor");
  }
  return score;
}
