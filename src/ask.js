import {
  createReadBudget,
  findTextHits
} from "./scanner.js";
import {
  classifyQuestionIntent,
  extractLiteralSearch
} from "./ask/intent.js";

export {
  classifyQuestionIntent,
  extractLiteralSearch
} from "./ask/intent.js";

/**
 * @typedef {ReturnType<typeof import("./analyze.js").analyzeRepo>} Analysis
 * @typedef {import("./analyze/current-state.js").StateClaim} AnswerClaim
 * @typedef {{
 *   confidence: "known" | "likely" | "unknown" | "stale / suspicious",
 *   summary: string,
 *   summary_trust?: "repository-untrusted" | "kanon-generated",
 *   claims: AnswerClaim[],
 *   evidence: ({
 *     id: string,
 *     path: string,
 *     trust: "repository-untrusted"
 *   } | (import("./scanner/read.js").TextHit & {
 *     trust: "repository-untrusted"
 *   }))[],
 *   searched_terms: string[],
 *   scan_complete?: boolean,
 *   needs_clarification?: boolean
 * }} RepoAnswer
 */

/**
 * @param {Analysis} analysis
 * @param {unknown} question
 * @returns {RepoAnswer}
 */
export function answerRepoQuestion(analysis, question) {
  const state = analysis.state;
  const intent = classifyQuestionIntent(question);

  if (intent === "mixed") {
    return unknown(
      "The question mixes supported intents. Ask one question about purpose, run, test, Git state, documentation drift, or an explicit literal search.",
      [],
      state.scan.complete,
      true
    );
  }
  if (intent === "unsupported") {
    return unknown(
      "This question is outside the narrow ask contract. Ask about purpose, run, test, Git state, documentation drift, or use an explicit literal repository search.",
      [],
      state.scan.complete
    );
  }
  if (intent === "documentation") {
    if (state.current_state.stale_suspicious.length) {
      return fromClaims(
        "stale / suspicious",
        "Direct documentation contradictions were found.",
        state.current_state.stale_suspicious
      );
    }
    const unknownClaims = (state.verification.unknowns || []).map(
      (item) => ({
        claim: item.claim,
        reason: item.observation,
        evidence: item.evidence
      })
    );
    return {
      ...unknown(
        "No direct documentation contradiction was found. Non-observation is not proof that the documentation is current.",
        [],
        state.scan.complete
      ),
      claims: unknownClaims
    };
  }
  if (intent === "purpose") {
    return fromClaims(
      state.purpose.confidence,
      state.purpose.claim,
      [state.purpose]
    );
  }
  if (intent === "test") {
    return commandAnswer(
      "test",
      state.commands.test,
      state.command_execution.policy
    );
  }
  if (intent === "run") {
    const commands = [
      ...state.commands.run,
      ...state.commands.dev,
      ...state.commands.build
    ];
    return commandAnswer(
      "run, develop, or build",
      commands,
      state.command_execution.policy
    );
  }
  if (intent === "git") {
    if (!state.git.found || state.git.dirty === null) {
      return unknown(
        state.git.diagnostics
          .map((item) => item.message)
          .filter(Boolean)
          .join(" ") || "Git state could not be observed.",
        [],
        false
      );
    }
    return {
      confidence: "known",
      summary:
        `Git status observed ${state.git.change_count} working-tree change(s)` +
        `${state.git.changes_truncated ? "; only the first 100 non-sensitive paths are retained" : ""}.`,
      claims: [],
      evidence: state.git.evidence.map((id) => ({
        id,
        path: ".git",
        trust: "repository-untrusted"
      })),
      searched_terms: [],
      scan_complete: state.scan.complete
    };
  }

  return literalSearch(analysis, extractLiteralSearch(question));
}

/**
 * @param {Analysis} analysis
 * @param {string | null} literal
 * @returns {RepoAnswer}
 */
function literalSearch(analysis, literal) {
  const files = analysis.inspection.files;
  const scan = analysis.inspection.scan;
  if (!literal) {
    return unknown(
      "No live repository inspection context was available for literal search.",
      literal ? [literal] : [],
      false
    );
  }
  const budget = createReadBudget(
    Math.min(scan.max_total_text_bytes || 8 * 1024 * 1024, 8 * 1024 * 1024)
  );
  const hits = findTextHits(
    analysis.root,
    files,
    [literal],
    {
      budget,
      diagnostics: scan,
      limit: 20,
      readLimit: Math.min(scan.max_file_bytes || 120_000, 120_000)
    }
  );
  if (!hits.length) {
    return unknown(
      `The literal value was not observed by the current bounded search. This is not an absence conclusion.`,
      [literal],
      scan.complete
    );
  }
  return {
    confidence: "known",
    summary:
      `${hits.length} file-level literal match(es) were observed. ` +
      "Substring matches do not establish feature use, runtime behavior, or any database conclusion.",
    claims: [],
    evidence: hits.map((hit) => ({
      ...hit,
      trust: "repository-untrusted"
    })),
    searched_terms: [literal],
    scan_complete: scan.complete
  };
}

/**
 * @param {string} label
 * @param {import("./analyze/findings.js").DeclaredCommand[]} commands
 * @param {"ask" | "never"} executionPolicy
 * @returns {RepoAnswer}
 */
function commandAnswer(label, commands, executionPolicy) {
  if (!commands.length) {
    return unknown(`No explicit ${label} command declaration was found.`);
  }
  const confidence = commands.every(
    (item) => item.confidence === "known"
  )
    ? "known"
    : "likely";
  return {
    confidence,
    summary:
      `Repository-declared ${label} candidate data was found. ` +
      (
        executionPolicy === "never"
          ? "Execution success is Unknown; current policy prohibits execution."
          : "Execution success is Unknown; definition review and user approval are required before execution."
      ),
    claims: commands.map((item) => ({
      claim:
        item.cwd && item.cwd !== "."
          ? `${item.command} (from ${item.cwd})`
          : item.command,
      evidence: item.evidence || [],
      trust: "repository-untrusted"
    })),
    evidence: [],
    searched_terms: []
  };
}

/**
 * @param {RepoAnswer["confidence"]} confidence
 * @param {string} summary
 * @param {AnswerClaim[]} claims
 * @returns {RepoAnswer}
 */
function fromClaims(confidence, summary, claims) {
  return {
    confidence,
    summary,
    summary_trust: (claims || []).some(
      (claim) => claim.trust === "repository-untrusted"
    )
      ? "repository-untrusted"
      : "kanon-generated",
    claims: claims || [],
    evidence: [],
    searched_terms: []
  };
}

/**
 * @param {string} summary
 * @param {string[]} [searchedTerms]
 * @param {boolean} [complete]
 * @param {boolean} [needsClarification]
 * @returns {RepoAnswer}
 */
function unknown(
  summary,
  searchedTerms = [],
  complete = true,
  needsClarification = false
) {
  return {
    confidence: "unknown",
    summary: complete
      ? summary
      : `${summary} Repository inspection was incomplete.`,
    claims: [],
    evidence: [],
    searched_terms: searchedTerms,
    scan_complete: complete,
    needs_clarification: needsClarification
  };
}
