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

const CATEGORY_GROUPS = {
  testing: "Project Health",
  ci: "Project Health",
  release: "Project Health",
  docs: "Project Health",
  maintainability: "Code Quality",
  product: "Product Strategy"
};

const CATEGORY_ORDER = ["docs", "testing", "ci", "release", "maintainability", "product"];
const IMPACT_WEIGHT = { high: 3, medium: 2, low: 1 };

export function normalizeImproveMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const mode = MODE_ALIASES.get(normalized);
  if (!mode) {
    throw new Error("Invalid improve mode. Use top, audit, scorecard, or choose 1, 2, or 3.");
  }
  return mode;
}

export function buildImprovements(analysis) {
  const state = analysis.state;
  const recommendations = rankRecommendations([
    ...testingRecommendations(state),
    ...ciRecommendations(state),
    ...releaseRecommendations(state),
    ...docsRecommendations(state),
    ...maintainabilityRecommendations(state),
    ...productRecommendations(state)
  ]);
  const scorecard = buildScorecard(state);

  return {
    generated_at: state.generated_at,
    recommendations,
    scorecard,
    summary: {
      total: recommendations.length,
      high_impact: recommendations.filter((item) => item.impact === "high").length,
      categories: unique(recommendations.map((item) => item.category))
    }
  };
}

export function groupRecommendations(recommendations) {
  const groups = [];
  for (const category of CATEGORY_ORDER) {
    const items = recommendations.filter((item) => item.category === category);
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

function testingRecommendations(state) {
  if (!state.commands.test.length) {
    return [
      recommendation({
        id: "testing.command",
        category: "testing",
        title: "Define the project test command",
        why: "Kanon could not find an explicit test command, so agents and contributors have no reliable first verification step.",
        next_action: "Add or document the canonical test command, then make README setup point to it.",
        impact: "high",
        confidence: "known"
      })
    ];
  }

  if (!state.tests.count) {
    return [
      recommendation({
        id: "testing.coverage",
        category: "testing",
        title: "Back the test command with visible test files",
        why: "A test command exists, but Kanon did not find test-like files to explain what behavior is protected.",
        next_action: "Add focused tests around the main CLI or library behavior that contributors are expected to preserve.",
        impact: "medium",
        confidence: "likely",
        evidence: state.commands.test[0].evidence
      })
    ];
  }

  if (state.tests.count < 3) {
    return [
      recommendation({
        id: "testing.depth",
        category: "testing",
        title: "Broaden tests around real usage scenarios",
        why: "Test evidence exists, but the detected suite is still small enough that important user paths may be uncovered.",
        next_action: "Add fixture-based tests for the highest-risk command or workflow before expanding features.",
        impact: "medium",
        confidence: "likely",
        evidence: unique([...state.tests.evidence, ...state.commands.test[0].evidence])
      })
    ];
  }

  return [];
}

function ciRecommendations(state) {
  if (state.ci.found) {
    return [];
  }

  return [
    recommendation({
      id: "ci.missing",
      category: "ci",
      title: "Add continuous verification",
      why: "No CI configuration was detected, so project health depends on local discipline.",
      next_action: "Add a minimal CI workflow that runs the canonical test command on every pull request.",
      impact: "high",
      confidence: "known"
    })
  ];
}

function releaseRecommendations(state) {
  if (state.release.found) {
    return [];
  }

  return [
    recommendation({
      id: "release.path",
      category: "release",
      title: "Make the release path explicit",
      why: "No release workflow, changelog, or release configuration was detected.",
      next_action: "Add a short release checklist or changelog before the project grows more distribution surface.",
      impact: "medium",
      confidence: "known"
    })
  ];
}

function docsRecommendations(state) {
  if (!state.verification.checked) {
    return [
      recommendation({
        id: "docs.readme",
        category: "docs",
        title: "Add a README as the project contract",
        why: "Kanon could not verify setup or usage claims because no README was detected.",
        next_action: "Add a README with purpose, install, run, test, and contribution starting points.",
        impact: "high",
        confidence: "known",
        evidence: state.verification.issues.flatMap((issue) => issue.evidence || [])
      })
    ];
  }

  if (state.verification.issues.length) {
    return [
      recommendation({
        id: "docs.drift",
        category: "docs",
        title: "Resolve README drift before expanding scope",
        why: `${state.verification.issues.length} README claim(s) look stale or unsupported by repo evidence.`,
        next_action: "Fix the documented commands or remove unsupported feature/process claims.",
        impact: "high",
        confidence: "known",
        evidence: state.verification.issues.flatMap((issue) => issue.evidence || [])
      })
    ];
  }

  return [];
}

function maintainabilityRecommendations(state) {
  const recommendations = [];

  if (state.todos.length) {
    recommendations.push(
      recommendation({
        id: "maintainability.todos",
        category: "maintainability",
        title: "Triage inline TODO/FIXME markers",
        why: `${state.todos.length} TODO/FIXME marker(s) were found in repo files.`,
        next_action: "Turn the still-relevant markers into tracked work and remove stale markers from code or docs.",
        impact: state.todos.length > 5 ? "medium" : "low",
        confidence: "known",
        evidence: unique(state.todos.slice(0, 8).map((todo) => `${todo.path}:${todo.line}`))
      })
    );
  }

  if (!state.important_files.some((file) => /src\/(cli|index|run|main)\.|^bin\//.test(file.path))) {
    recommendations.push(
      recommendation({
        id: "maintainability.entrypoint",
        category: "maintainability",
        title: "Clarify the main implementation entrypoint",
        why: "Kanon did not identify a standard source or package entrypoint among important files.",
        next_action: "Document the main runtime path or align the project with a conventional entrypoint.",
        impact: "medium",
        confidence: "likely",
        evidence: state.important_files.flatMap((file) => file.evidence || []).slice(0, 4)
      })
    );
  }

  return recommendations;
}

function productRecommendations(state) {
  if (state.purpose.confidence === "unknown") {
    return [
      recommendation({
        id: "product.purpose",
        category: "product",
        title: "State the project purpose for future planning",
        why: "No README or package metadata was found to explain what the project is for.",
        next_action: "Add a one-paragraph purpose statement and the intended primary user.",
        impact: "medium",
        confidence: "known"
      })
    ];
  }

  if (!state.commands.run.length) {
    return [
      recommendation({
        id: "product.first-use",
        category: "product",
        title: "Clarify the first successful user action",
        why: "Kanon found project purpose, but no run command or exposed CLI path.",
        next_action: "Document the first user-visible action someone should take after installation.",
        impact: "medium",
        confidence: "likely",
        evidence: state.purpose.evidence
      })
    ];
  }

  return [];
}

function buildScorecard(state) {
  return [
    score("testing", testScore(state)),
    score("ci", ciScore(state)),
    score("release", releaseScore(state)),
    score("docs", docsScore(state)),
    score("maintainability", maintainabilityScore(state)),
    score("product", productScore(state))
  ];
}

function testScore(state) {
  if (state.commands.test.length && state.tests.count >= 3) {
    return {
      score: 85,
      reason: "A test command and multiple test files were detected.",
      evidence: unique([...state.commands.test[0].evidence, ...state.tests.evidence])
    };
  }
  if (state.commands.test.length && state.tests.found) {
    return {
      score: 70,
      reason: "A test command and some test evidence were detected.",
      evidence: unique([...state.commands.test[0].evidence, ...state.tests.evidence])
    };
  }
  if (state.commands.test.length || state.tests.found) {
    return {
      score: 55,
      reason: "Partial test evidence was detected, but the verification path is not fully clear.",
      evidence: unique([
        ...((state.commands.test[0] && state.commands.test[0].evidence) || []),
        ...state.tests.evidence
      ])
    };
  }
  return { score: 25, reason: "No explicit test command or test evidence was detected.", evidence: [] };
}

function ciScore(state) {
  if (state.ci.found) {
    return {
      score: 85,
      reason: "CI configuration was detected.",
      evidence: state.ci.files.map((file) => file.evidence)
    };
  }
  return { score: 25, reason: "No CI configuration was detected.", evidence: [] };
}

function releaseScore(state) {
  if (state.release.found) {
    return {
      score: 80,
      reason: "Release or changelog evidence was detected.",
      evidence: state.release.files.map((file) => file.evidence)
    };
  }
  return { score: 35, reason: "No release workflow, changelog, or release config was detected.", evidence: [] };
}

function docsScore(state) {
  if (!state.verification.checked) {
    return { score: 35, reason: "No README was available for verification.", evidence: [] };
  }
  if (state.verification.issues.length) {
    return {
      score: 45,
      reason: "README verification found stale or unsupported claims.",
      evidence: state.verification.issues.flatMap((issue) => issue.evidence || [])
    };
  }
  return { score: 85, reason: "README verification found no drift with current checks.", evidence: [] };
}

function maintainabilityScore(state) {
  if (state.todos.length > 5) {
    return {
      score: 55,
      reason: "Several TODO/FIXME markers were detected.",
      evidence: state.todos.slice(0, 8).map((todo) => `${todo.path}:${todo.line}`)
    };
  }
  if (state.todos.length) {
    return {
      score: 70,
      reason: "A small number of TODO/FIXME markers were detected.",
      evidence: state.todos.slice(0, 8).map((todo) => `${todo.path}:${todo.line}`)
    };
  }
  if (state.important_files.length) {
    return {
      score: 80,
      reason: "Kanon found standard important files and no TODO/FIXME markers.",
      evidence: state.important_files.slice(0, 4).flatMap((file) => file.evidence || [])
    };
  }
  return { score: 50, reason: "Few standard project structure signals were detected.", evidence: [] };
}

function productScore(state) {
  if (state.purpose.confidence === "unknown") {
    return { score: 35, reason: "No project purpose evidence was detected.", evidence: [] };
  }
  if (state.commands.run.length) {
    return {
      score: 80,
      reason: "Project purpose and a first-run path were detected.",
      evidence: unique([...state.purpose.evidence, ...state.commands.run[0].evidence])
    };
  }
  return {
    score: 60,
    reason: "Project purpose was detected, but first-use behavior is not explicit.",
    evidence: state.purpose.evidence
  };
}

function score(category, item) {
  return {
    category,
    label: labelForCategory(category),
    score: item.score,
    status: statusForScore(item.score),
    reason: item.reason,
    evidence: unique(item.evidence || [])
  };
}

function recommendation(input) {
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

function rankRecommendations(recommendations) {
  return recommendations
    .slice()
    .sort((a, b) => {
      const impact = IMPACT_WEIGHT[b.impact] - IMPACT_WEIGHT[a.impact];
      if (impact) {
        return impact;
      }
      const category = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
      if (category) {
        return category;
      }
      return a.id.localeCompare(b.id);
    });
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

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
