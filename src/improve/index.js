import { buildRecommendations } from "./recommendations.js";
import { buildScorecard } from "./scorecard.js";
import {
  CATEGORY_GROUPS,
  CATEGORY_ORDER,
  IMPROVE_MODES,
  normalizeImproveMode,
  rankRecommendations,
  unique
} from "./shared.js";

export { IMPROVE_MODES, normalizeImproveMode };

export function buildImprovements(analysis) {
  const state = analysis.state;
  const recommendations = rankRecommendations(buildRecommendations(state));
  const scorecard = buildScorecard(state);

  return {
    generated_at: state.generated_at,
    recommendations,
    scorecard,
    limitations: state.scan?.complete
      ? []
      : [
          "Repository scan was incomplete; absence-based recommendations and scores are provisional."
        ],
    summary: {
      total: recommendations.length,
      high_impact: recommendations
        .filter((item) => item.impact === "high")
        .length,
      categories: unique(recommendations.map((item) => item.category))
    }
  };
}

export function groupRecommendations(recommendations) {
  const groups = [];
  for (const category of CATEGORY_ORDER) {
    const items = recommendations.filter(
      (item) => item.category === category
    );
    if (!items.length) {
      continue;
    }
    groups.push({
      group: CATEGORY_GROUPS[category],
      category,
      items
    });
  }
  return groups;
}
