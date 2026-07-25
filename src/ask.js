import { findTextHits, scanRepo } from "./scanner.js";

const STOP_WORDS = new Set([
  "about",
  "does",
  "from",
  "have",
  "repo",
  "repository",
  "that",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your"
]);

const DATABASE_SIGNALS = [
  "postgres",
  "postgresql",
  "mysql",
  "mariadb",
  "sqlite",
  "mongodb",
  "mongoose",
  "redis",
  "dynamodb",
  "firestore",
  "supabase",
  "prisma",
  "sqlalchemy",
  "typeorm",
  "sequelize"
];

export function answerRepoQuestion(analysis, question) {
  const normalized = String(question || "").trim().toLowerCase();
  const state = analysis.state;

  if (/left|todo|next|start|contribution|contribute/.test(normalized)) {
    return fromClaims(
      "suggested",
      "Suggested starting points from current repository evidence.",
      state.current_state.suggested
    );
  }

  if (/stale|drift|suspicious|readme/.test(normalized)) {
    if (!state.current_state.stale_suspicious.length) {
      return unknown("No stale README claim was detected by the current checks; this is not proof that all documentation is current.");
    }
    return fromClaims(
      "stale / suspicious",
      "Documentation claims conflict with or lack support from repository evidence.",
      state.current_state.stale_suspicious
    );
  }

  if (/purpose|what.*(do|is)|about/.test(normalized)) {
    return fromClaims(state.purpose.confidence, state.purpose.claim, [state.purpose]);
  }

  if (/test|verify|check/.test(normalized)) {
    return commandAnswer("test", state.commands.test);
  }

  if (/run|start|dev|build/.test(normalized)) {
    const commands = [...state.commands.run, ...state.commands.dev, ...state.commands.build];
    return commandAnswer("run, develop, or build", commands);
  }

  if (/branch|git status|working tree|uncommitted/.test(normalized)) {
    if (!state.git.found) {
      return unknown("No Git repository evidence was available.");
    }
    return {
      confidence: "known",
      summary: `Git${state.git.branch ? ` branch ${state.git.branch}` : ""} has ${state.git.change_count} working-tree change(s).`,
      claims: [],
      evidence: state.git.evidence.map((id) => ({ id, path: ".git" })),
      searched_terms: []
    };
  }

  const scanned = scanRepo(analysis.root, {
    maxFiles: state.scan?.max_files,
    maxFileBytes: state.scan?.max_file_bytes,
    useGitIgnore: state.scan?.strategy === "git"
  });
  const databaseQuestion = /\b(database|db|data store|datastore)\b/.test(normalized);
  const terms = databaseQuestion ? DATABASE_SIGNALS : significantTerms(normalized);
  const rawHits = findTextHits(analysis.root, scanned.files, terms, { limit: 20 });
  const hits = databaseQuestion
    ? rawHits.filter((hit) => !isTestPath(hit.path) && !isBareSignalDefinition(hit))
    : rawHits;

  if (!hits.length) {
    const subject = databaseQuestion ? "database technology" : "the requested subject";
    return unknown(
      `No repository evidence was found for ${subject}.`,
      terms,
      scanned.diagnostics.complete
    );
  }

  const matched = Array.from(new Set(hits.map((hit) => hit.matched_term)));
  return {
    confidence: "likely",
    summary: databaseQuestion
      ? `Database-related signals were found for: ${matched.join(", ")}. Confirm actual runtime use before treating this as known.`
      : "Potentially relevant repository evidence was found. Inspect it before drawing a stronger conclusion.",
    claims: [],
    evidence: hits,
    searched_terms: terms,
    scan_complete: scanned.diagnostics.complete
  };
}

function commandAnswer(label, commands) {
  if (!commands.length) {
    return unknown(`No explicit ${label} command was found.`);
  }
  return {
    confidence: "known",
    summary: `The repository declares: ${commands.map((item) => item.command).join(", ")}.`,
    claims: commands.map((item) => ({
      claim: item.command,
      evidence: item.evidence || []
    })),
    evidence: [],
    searched_terms: []
  };
}

function fromClaims(confidence, summary, claims) {
  return {
    confidence,
    summary,
    claims: claims || [],
    evidence: [],
    searched_terms: []
  };
}

function unknown(summary, searchedTerms = [], complete = true) {
  return {
    confidence: "unknown",
    summary: complete ? summary : `${summary} The repository scan was incomplete.`,
    claims: [],
    evidence: [],
    searched_terms: searchedTerms,
    scan_complete: complete
  };
}

function significantTerms(question) {
  return Array.from(
    new Set(
      question
        .replace(/[^a-z0-9_+-]+/g, " ")
        .split(/\s+/)
        .filter((term) => term.length >= 4 && !STOP_WORDS.has(term))
    )
  ).slice(0, 8);
}

function isTestPath(relPath) {
  return /(^|\/)(test|tests|__tests__)\//.test(relPath) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(relPath);
}

function isBareSignalDefinition(hit) {
  const escaped = hit.matched_term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[\"']${escaped}[\"']\\s*,?$`, "i").test(hit.excerpt);
}
