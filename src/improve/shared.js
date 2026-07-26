export const IMPROVE_MODES = new Set(["top", "audit", "scorecard"]);

const MODE_ALIASES = new Map([
  ["1", "top"],
  ["top", "top"],
  ["top5", "top"],
  ["top-5", "top"],
  ["2", "audit"],
  ["audit", "audit"],
  ["full", "audit"],
  ["full-audit", "audit"],
  ["3", "scorecard"],
  ["score", "scorecard"],
  ["scorecard", "scorecard"]
]);

export const CATEGORY_GROUPS = {
  testing: "Project Health",
  ci: "Project Health",
  release: "Project Health",
  docs: "Project Health",
  maintainability: "Code Quality",
  product: "Product Strategy"
};

export const CATEGORY_ORDER = [
  "docs",
  "testing",
  "ci",
  "release",
  "maintainability",
  "product"
];
const IMPACT_WEIGHT = { high: 3, medium: 2, low: 1 };

export function normalizeImproveMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const mode = MODE_ALIASES.get(normalized);
  if (!mode) {
    throw new Error(
      "Invalid improve mode. Use top, audit, scorecard, or choose 1, 2, or 3."
    );
  }
  return mode;
}

export function recommendation(input) {
  return {
    id: input.id,
    category: input.category,
    group: CATEGORY_GROUPS[input.category],
    title: input.title,
    why: input.why,
    next_action: input.next_action,
    impact: input.impact,
    confidence: input.confidence,
    evidence: unique(input.evidence || [])
  };
}

export function rankRecommendations(recommendations) {
  return recommendations
    .slice()
    .sort((a, b) => {
      const impact = IMPACT_WEIGHT[b.impact] - IMPACT_WEIGHT[a.impact];
      if (impact) {
        return impact;
      }
      const category = CATEGORY_ORDER.indexOf(a.category) -
        CATEGORY_ORDER.indexOf(b.category);
      if (category) {
        return category;
      }
      return a.id.localeCompare(b.id);
    });
}

export function score(category, item) {
  return {
    category,
    label: labelForCategory(category),
    score: item.score,
    status: statusForScore(item.score),
    reason: item.reason,
    evidence: unique(item.evidence || [])
  };
}

export function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function absenceConfidence(state) {
  return state.scan?.complete ? "likely" : "unknown";
}

function labelForCategory(category) {
  if (category === "ci") {
    return "CI";
  }
  return category
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function statusForScore(value) {
  if (value >= 80) {
    return "strong";
  }
  if (value >= 60) {
    return "developing";
  }
  if (value >= 40) {
    return "thin";
  }
  return "weak";
}
