import { analyzeRepo as analyzeCompatibilityRepo } from "../compatibility/refresh.js";

/**
 * @typedef {(event: Record<string, unknown>) => void} RankingObserver
 * @typedef {NonNullable<Parameters<typeof analyzeCompatibilityRepo>[1]> & {
 *   _rankingObserver?: RankingObserver,
 *   inspectGit?: boolean
 * }} EvaluationOptions
 * @typedef {{path: string, reason: string, fan_in: number}}
 *   EvaluationImportantFile
 */
export const EVALUATION_SELECTION_CONTRACT =
  "kanon-v1.1-compact-first-five-v1";

/** @param {string} [root] @param {EvaluationOptions} [options] */
export function analyzeRepo(root = process.cwd(), options = {}) {
  const { _rankingObserver: observer, ...analysisOptions } = options;
  /** @type {Map<string, {eligible: boolean, rankedPosition: number | null, reason: string | null}>} */
  const tracedCandidates = new Map();
  const compatibilityObserver = typeof observer === "function"
    ? /** @type {RankingObserver} */ ((event) => {
        recordCompactObservation(tracedCandidates, event);
        emit(observer, event);
      })
    : undefined;
  const analysis = analyzeCompatibilityRepo(root, {
    ...analysisOptions,
    ...(compatibilityObserver === undefined
      ? {}
      : { _rankingObserver: compatibilityObserver })
  });
  const rankedImportantFiles = /** @type {EvaluationImportantFile[]} */ (
    Array.isArray(analysis.state.important_files)
      ? analysis.state.important_files.slice(0, 16)
      : []
  );
  const importantFiles = rankedImportantFiles.slice(0, 5);
  emitEvaluationTrace(
    observer,
    tracedCandidates,
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

/** @param {Map<string, {eligible: boolean, rankedPosition: number | null, reason: string | null}>} candidates @param {Record<string, unknown>} event */
function recordCompactObservation(candidates, event) {
  if (event.type === "candidate-discovered" && typeof event.path === "string") {
    candidates.set(event.path, {
      eligible: event.eligible === true,
      rankedPosition: null,
      reason: null
    });
    return;
  }
  if (typeof event.path !== "string") return;
  const candidate = candidates.get(event.path);
  if (!candidate) return;
  if (event.type === "candidate-scored") {
    const signal = Array.isArray(event.signals) ? event.signals[0] : null;
    candidate.reason = typeof signal?.reason === "string"
      ? signal.reason
      : null;
  } else if (
    event.type === "candidate-ordered" &&
    Number.isSafeInteger(event.ranked_position)
  ) {
    candidate.rankedPosition = Number(event.ranked_position);
  }
}

/** @param {RankingObserver | undefined} observer @param {Map<string, {eligible: boolean, rankedPosition: number | null, reason: string | null}>} candidates @param {EvaluationImportantFile[]} rankedImportantFiles @param {EvaluationImportantFile[]} importantFiles */
function emitEvaluationTrace(observer, candidates, rankedImportantFiles, importantFiles) {
  if (typeof observer !== "function") return;
  const rankedPaths = rankedImportantFiles.map((item) => item.path);
  const selectedPaths = importantFiles.map((item) => item.path);
  const rankedPathSet = new Set(rankedPaths);
  emit(observer, {
    type: "curation-stage-entered",
    stage: "evaluation-five-file-cap",
    stage_ordinal: 2,
    ordering: ["compact-important-files"],
    quota: 5,
    selected: [...rankedPaths]
  });
  emit(observer, {
    type: "curation-stage-exited",
    stage: "evaluation-five-file-cap",
    stage_ordinal: 2,
    selected: [...selectedPaths]
  });
  const selectedRanks = new Map(
    importantFiles.map((item, index) => [item.path, index + 1])
  );
  const reasons = new Map(
    rankedImportantFiles.map((item) => [item.path, item.reason])
  );
  const eligible = Array.from(candidates.entries())
    .filter(([, candidate]) => candidate.eligible)
    .sort((left, right) =>
      (left[1].rankedPosition || Number.MAX_SAFE_INTEGER) -
      (right[1].rankedPosition || Number.MAX_SAFE_INTEGER)
    );
  for (const [selectedPath, candidate] of eligible) {
    const finalRank = selectedRanks.get(selectedPath) || null;
    emit(observer, {
      type: "candidate-finalized",
      path: selectedPath,
      final_rank: finalRank,
      selected: finalRank !== null,
      result: finalRank !== null
        ? "selected"
        : rankedPathSet.has(selectedPath)
          ? "cap-excluded"
          : "not-selected",
      selection_reason: finalRank === null
        ? null
        : reasons.get(selectedPath) || candidate.reason,
      selection_heuristic: finalRank === null
        ? null
        : EVALUATION_SELECTION_CONTRACT
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
