import { analyzeRepo as analyzeCompatibilityRepo } from "../compatibility/refresh.js";

/**
 * @typedef {(event: Record<string, unknown>) => void} RankingObserver
 * @typedef {NonNullable<Parameters<typeof analyzeCompatibilityRepo>[1]> & {
 *   _rankingObserver?: RankingObserver,
 *   inspectGit?: boolean
 * }} EvaluationOptions
 * @typedef {{path: string, reason: string, fan_in: number}}
 *   EvaluationImportantFile
 * @typedef {{path: string, text: boolean}} EvaluationFile
 */
const TRACE_STAGES = Object.freeze([
  "root-readme",
  "root-contracts",
  "workspace-tasks-pre",
  "root-tasks",
  "framework-declarations",
  "manifest-entrypoints",
  "go-entrypoint",
  "ecosystem-test-anchor",
  "package-declarations",
  "workspace-tasks-post",
  "workspace-readme",
  "fan-in",
  "literal-reference",
  "executable-syntax",
  "final-cap"
]);

/** @param {string} [root] @param {EvaluationOptions} [options] */
export function analyzeRepo(root = process.cwd(), options = {}) {
  const { _rankingObserver: observer, ...analysisOptions } = options;
  const analysis = analyzeCompatibilityRepo(root, analysisOptions);
  const rankedImportantFiles = /** @type {EvaluationImportantFile[]} */ (
    Array.isArray(analysis.state.important_files)
      ? analysis.state.important_files.slice(0, 16)
      : []
  );
  const importantFiles = rankedImportantFiles.slice(0, 5);
  emitRankingTrace(
    observer,
    analysis.inspection.files,
    rankedImportantFiles,
    importantFiles
  );
  return {
    ...analysis,
    state: {
      ...analysis.state,
      important_files: importantFiles
    },
    inspection: {
      ...analysis.inspection,
      scan: analysis.state.scan
    }
  };
}

/** @param {RankingObserver | undefined} observer @param {EvaluationFile[]} files @param {EvaluationImportantFile[]} rankedImportantFiles @param {EvaluationImportantFile[]} importantFiles */
function emitRankingTrace(observer, files, rankedImportantFiles, importantFiles) {
  if (typeof observer !== "function") return;
  const importantByPath = new Map(
    rankedImportantFiles.map((item, index) => [item.path, { item, index }])
  );
  /** @type {{path: string, score: number, fanIn: number}[]} */
  const eligible = [];
  for (const [inputIndex, file] of files.entries()) {
    const rankingEligible = file.text === true || importantByPath.has(file.path);
    emit(observer, {
      type: "candidate-discovered",
      path: file.path,
      discovery_source: "scanner",
      input_position: inputIndex + 1,
      eligible: rankingEligible,
      eligibility_reason: rankingEligible
        ? "ranking-eligible"
        : "non-text-file"
    });
    if (!rankingEligible) continue;
    const selected = importantByPath.get(file.path);
    const score = selected ? 100_000 - selected.index : 0;
    const fanIn = selected?.item.fan_in || 0;
    const signals = selected
      ? [{
          type: "compatibility-important-file",
          reason: selected.item.reason,
          score: 0,
          confidence: "known",
          source: "compatibility-projection"
        }]
      : [];
    const contributions = score === 0
      ? []
      : [{ name: "compatibility-priority", value: score }];
    emit(observer, {
      type: "candidate-scored",
      path: file.path,
      score,
      fan_in: fanIn,
      referenced_by: 0,
      signals,
      contributions,
      tie_break: { score, fan_in: fanIn, path: file.path }
    });
    eligible.push({ path: file.path, score, fanIn });
  }
  eligible.sort((left, right) =>
    right.score - left.score ||
    right.fanIn - left.fanIn ||
    left.path.localeCompare(right.path)
  );
  for (const [rankedIndex, candidate] of eligible.entries()) {
    emit(observer, {
      type: "candidate-ordered",
      path: candidate.path,
      ranked_position: rankedIndex + 1,
      ordering: ["score:desc", "fan_in:desc", "path:asc"]
    });
  }
  /** @type {string[]} */
  let selected = [];
  for (const [stageIndex, stage] of TRACE_STAGES.entries()) {
    const finalCap = stage === "final-cap";
    emit(observer, {
      type: "curation-stage-entered",
      stage,
      stage_ordinal: stageIndex + 1,
      ordering: finalCap
        ? ["compatibility-rank"]
        : ["compatibility-observation"],
      quota: finalCap ? 5 : null,
      selected: [...selected]
    });
    if (stage === "literal-reference") {
      for (const [entryIndex, item] of rankedImportantFiles.entries()) {
        emit(observer, {
          type: "curation-decision",
          path: item.path,
          stage,
          stage_ordinal: stageIndex + 1,
          entry_position: entryIndex + 1,
          selected_count_on_entry: selected.length,
          decision: "selected",
          reason: item.reason,
          heuristic: "compatibility-important-file",
          deduplicated: false,
          displaced_by: null,
          quota: null,
          cap: null
        });
        selected = [...selected, item.path];
      }
    }
    if (finalCap) selected = selected.slice(0, 5);
    emit(observer, {
      type: "curation-stage-exited",
      stage,
      stage_ordinal: stageIndex + 1,
      selected: [...selected]
    });
  }
  const selectedRanks = new Map(
    importantFiles.map((item, index) => [item.path, index + 1])
  );
  const rankedPaths = new Set(rankedImportantFiles.map((item) => item.path));
  for (const candidate of eligible) {
    const finalRank = selectedRanks.get(candidate.path) || null;
    emit(observer, {
      type: "candidate-finalized",
      path: candidate.path,
      final_rank: finalRank,
      selected: finalRank !== null,
      result: finalRank !== null
        ? "selected"
        : rankedPaths.has(candidate.path)
          ? "cap-excluded"
          : "not-selected",
      selection_reason: finalRank === null
        ? null
        : importantByPath.get(candidate.path)?.item.reason || null,
      selection_heuristic: finalRank === null
        ? null
        : "compatibility-important-file"
    });
  }
}

/** @param {RankingObserver} observer @param {Record<string, unknown>} event */
function emit(observer, event) {
  try {
    observer(event);
  } catch {
    return;
  }
}
