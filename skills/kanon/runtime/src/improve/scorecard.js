import { score, unique } from "./shared.js";

export function buildScorecard(state) {
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
      evidence: unique([
        ...state.commands.test[0].evidence,
        ...state.tests.evidence
      ])
    };
  }
  if (state.commands.test.length && state.tests.found) {
    return {
      score: 70,
      reason: "A test command and some test evidence were detected.",
      evidence: unique([
        ...state.commands.test[0].evidence,
        ...state.tests.evidence
      ])
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
  return {
    score: 25,
    reason: "No explicit test command or test evidence was detected.",
    evidence: []
  };
}

function ciScore(state) {
  if (state.ci.found) {
    return {
      score: 85,
      reason: "CI configuration was detected.",
      evidence: state.ci.files.map((file) => file.evidence)
    };
  }
  return {
    score: 25,
    reason: "No CI configuration was detected.",
    evidence: []
  };
}

function releaseScore(state) {
  if (state.release.found) {
    return {
      score: 80,
      reason: "Release or changelog evidence was detected.",
      evidence: state.release.files.map((file) => file.evidence)
    };
  }
  return {
    score: 35,
    reason: "No release workflow, changelog, or release config was detected.",
    evidence: []
  };
}

function docsScore(state) {
  if (!state.verification.checked) {
    return {
      score: 35,
      reason: "No README was available for verification.",
      evidence: []
    };
  }
  if (state.verification.issues.length) {
    return {
      score: 45,
      reason: "README verification found stale or unsupported claims.",
      evidence: state.verification.issues.flatMap(
        (issue) => issue.evidence || []
      )
    };
  }
  return {
    score: 85,
    reason: "README verification found no drift with current checks.",
    evidence: []
  };
}

function maintainabilityScore(state) {
  if (state.todos.length > 5) {
    return {
      score: 55,
      reason: "Several TODO/FIXME markers were detected.",
      evidence: state.todos
        .slice(0, 8)
        .map((todo) => `${todo.path}:${todo.line}`)
    };
  }
  if (state.todos.length) {
    return {
      score: 70,
      reason: "A small number of TODO/FIXME markers were detected.",
      evidence: state.todos
        .slice(0, 8)
        .map((todo) => `${todo.path}:${todo.line}`)
    };
  }
  if (state.important_files.length) {
    return {
      score: 80,
      reason: "Kanon found standard important files and no TODO/FIXME markers.",
      evidence: state.important_files
        .slice(0, 4)
        .flatMap((file) => file.evidence || [])
    };
  }
  return {
    score: 50,
    reason: "Few standard project structure signals were detected.",
    evidence: []
  };
}

function productScore(state) {
  if (state.purpose.confidence === "unknown") {
    return {
      score: 35,
      reason: "No project purpose evidence was detected.",
      evidence: []
    };
  }
  if (state.commands.run.length) {
    return {
      score: 80,
      reason: "Project purpose and a first-run path were detected.",
      evidence: unique([
        ...state.purpose.evidence,
        ...state.commands.run[0].evidence
      ])
    };
  }
  return {
    score: 60,
    reason: "Project purpose was detected, but first-use behavior is not explicit.",
    evidence: state.purpose.evidence
  };
}
