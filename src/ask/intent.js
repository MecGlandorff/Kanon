/**
 * @typedef {"documentation" | "git" | "test" | "run" | "purpose" |
 *   "search" | "mixed" | "unsupported"} QuestionIntent
 */

/** @type {{intent: QuestionIntent, patterns: RegExp[]}[]} */
const INTENT_RULES = [
  {
    intent: "documentation",
    patterns: [
      /\b(?:documentation|docs?|readme)\s+(?:drift|stale|current|accurate)\b/,
      /\b(?:stale|drift)\s+(?:documentation|docs?|readme)\b/,
      /^what is stale\??$/
    ]
  },
  {
    intent: "git",
    patterns: [
      /\b(?:git state|git status|working tree|uncommitted changes?|current branch)\b/
    ]
  },
  {
    intent: "test",
    patterns: [
      /^(?:how (?:do|should|can) (?:i|we) )?(?:test|run tests?|check tests?)(?: (?:this|the) (?:repo|repository|project))?\??$/,
      /\bhow (?:do|should|can) (?:i|we) (?:test|run tests?|check tests?)\b/
    ]
  },
  {
    intent: "run",
    patterns: [
      /^(?:how (?:do|should|can) (?:i|we) )?(?:run|start|build|develop|serve)(?: (?:this|the) (?:repo|repository|project))?\??$/
    ]
  },
  {
    intent: "purpose",
    patterns: [
      /\b(?:purpose|overview)\b/,
      /^(?:tell me )?about (?:this|the) (?:repo|repository|project)\b/,
      /^what (?:does|is) (?:this|the) (?:repo|repository|project)(?: do)?\??$/,
      /\bwhat does (?:this|the) (?:repo|repository|project) do\b/
    ]
  }
];

/**
 * @param {unknown} question
 * @returns {QuestionIntent}
 */
export function classifyQuestionIntent(question) {
  const normalized = String(question || "").trim().toLowerCase();
  if (extractLiteralSearch(question)) {
    return "search";
  }
  const matches = INTENT_RULES
    .filter((rule) =>
      rule.patterns.some((pattern) => pattern.test(normalized))
    )
    .map((rule) => rule.intent);
  const unique = new Set(matches);
  if (unique.size > 1) {
    return "mixed";
  }
  return matches[0] || "unsupported";
}

/**
 * @param {unknown} question
 * @returns {string | null}
 */
export function extractLiteralSearch(question) {
  const value = String(question || "").trim();
  const match = value.match(
    /^(?:literal(?: repository)? search(?: for)?|search(?: (?:the )?repo(?:sitory)?)? for|find literal)\s+(?:"([^"]+)"|'([^']+)'|`([^`]+)`|(.+?))\s*\??$/i
  );
  const literal = match?.slice(1).find((item) => item !== undefined)?.trim();
  return literal ? literal.slice(0, 200) : null;
}
