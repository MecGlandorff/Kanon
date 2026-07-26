import {
  absenceConfidence,
  recommendation,
  unique
} from "./shared.js";

export function buildRecommendations(state) {
  return [
    ...testingRecommendations(state),
    ...ciRecommendations(state),
    ...releaseRecommendations(state),
    ...docsRecommendations(state),
    ...maintainabilityRecommendations(state),
    ...productRecommendations(state)
  ];
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
        confidence: absenceConfidence(state)
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
        evidence: unique([
          ...state.tests.evidence,
          ...state.commands.test[0].evidence
        ])
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
      confidence: absenceConfidence(state)
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
      confidence: absenceConfidence(state)
    })
  ];
}

function docsRecommendations(state) {
  if (state.verification.applicable === false) {
    return [];
  }
  if (!state.verification.checked) {
    return [
      recommendation({
        id: "docs.readme",
        category: "docs",
        title: "Add a README as the project contract",
        why: "Kanon could not verify setup or usage claims because no README was detected.",
        next_action: "Add a README with purpose, install, run, test, and contribution starting points.",
        impact: "high",
        confidence: absenceConfidence(state),
        evidence: state.verification.issues.flatMap(
          (issue) => issue.evidence || []
        )
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
        evidence: state.verification.issues.flatMap(
          (issue) => issue.evidence || []
        )
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
        evidence: unique(
          state.todos
            .slice(0, 8)
            .map((todo) => `${todo.path}:${todo.line}`)
        )
      })
    );
  }

  const hasEntrypoint = state.important_files.some(
    (file) => /src\/(cli|index|run|main)\.|^bin\//.test(file.path)
  );
  if (!hasEntrypoint) {
    recommendations.push(
      recommendation({
        id: "maintainability.entrypoint",
        category: "maintainability",
        title: "Clarify the main implementation entrypoint",
        why: "Kanon did not identify a standard source or package entrypoint among important files.",
        next_action: "Document the main runtime path or align the project with a conventional entrypoint.",
        impact: "medium",
        confidence: "likely",
        evidence: state.important_files
          .flatMap((file) => file.evidence || [])
          .slice(0, 4)
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
        confidence: absenceConfidence(state)
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
