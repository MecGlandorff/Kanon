import { scanLimitationReason } from "./utils.js";

export function buildCurrentState(input) {
  const state = {
    known: [],
    likely: [],
    unknown: [],
    stale_suspicious: [],
    suggested: []
  };
  addPurpose(state, input.purpose);
  addCommands(state, input.commands);
  addKnownSignals(state.known, input);
  for (const entrypoint of input.likelyEntrypoints) {
    state[entrypoint.confidence === "known" ? "known" : "likely"]
      .push(entrypoint);
  }
  addUnknowns(state.unknown, input);
  for (const issue of input.verification.issues) {
    state.stale_suspicious.push({
      claim: issue.claim,
      reason: issue.observation,
      evidence: issue.evidence
    });
  }
  addSuggestions(state.suggested, input);
  return state;
}

function addPurpose(state, purpose) {
  if (purpose.confidence === "known") {
    state.known.push({
      claim: `Repo purpose: ${purpose.claim}`,
      evidence: purpose.evidence
    });
  } else if (purpose.confidence === "likely") {
    state.likely.push({
      claim: `Declared repo purpose: ${purpose.claim}`,
      evidence: purpose.evidence
    });
  }
}

function addCommands(state, commands) {
  for (const group of ["test", "run", "build", "dev"]) {
    for (const command of commands[group]) {
      state[command.confidence === "known" ? "known" : "likely"].push({
        claim:
          `${group} command` +
          `${command.cwd && command.cwd !== "." ? ` (from ${command.cwd})` : ""}: ` +
          command.command,
        evidence: command.evidence
      });
    }
  }
}

function addKnownSignals(known, input) {
  if (input.tests.found) {
    known.push({
      claim:
        `${input.tests.count || "Some"} test evidence found` +
        `${input.tests.frameworks.length ? ` (${input.tests.frameworks.join(", ")})` : ""}.`,
      evidence: input.tests.evidence
    });
  }
  if (input.ci.found) {
    known.push({
      claim: `CI configuration found: ${paths(input.ci.files)}.`,
      evidence: input.ci.files.map((file) => file.evidence)
    });
  }
  if (input.deploy.found) {
    known.push({
      claim: `Deployment/runtime configuration found: ${paths(input.deploy.files)}.`,
      evidence: input.deploy.files.map((file) => file.evidence)
    });
  }
  if (input.git.found) {
    known.push({
      claim:
        `Git repository${input.git.branch ? ` on branch ${input.git.branch}` : ""}; ` +
        `${input.git.change_count} working-tree change(s).`,
      evidence: input.git.evidence
    });
  }
}

function addUnknowns(unknown, input) {
  if (!input.commands.test.length) {
    unknown.push({
      claim: "No explicit test command found.",
      reason:
        "No package test script, test task, or documented test command was detected."
    });
  }
  if (!input.ci.found) {
    unknown.push({
      claim: "No CI configuration found.",
      reason:
        "No GitHub Actions, GitLab CI, CircleCI, or similar CI config was detected."
    });
  }
  if (!input.deploy.found) {
    unknown.push({
      claim: "No deployment path found.",
      reason:
        "No Dockerfile, Procfile, platform config, or compose file was detected."
    });
  }
  if (!input.release.found) {
    unknown.push({
      claim: "No release workflow or changelog found.",
      reason:
        "No release workflow, releaserc, or CHANGELOG.md was detected."
    });
  }
  if (!input.scan.complete) {
    unknown.push({
      claim: "Repository scan was incomplete.",
      reason: scanLimitationReason(input.scan)
    });
  }
  if (input.scan.sensitive_files_skipped > 0) {
    unknown.push({
      claim:
        `${input.scan.sensitive_files_skipped} sensitive file(s) were intentionally excluded.`,
      reason:
        "Kanon does not read, hash, cite, or persist likely secret-bearing files."
    });
  }
}

function addSuggestions(suggested, input) {
  if (input.commands.test.length) {
    const test = input.commands.test[0];
    suggested.push({
      claim:
        `Run ${test.command}` +
        `${test.cwd && test.cwd !== "." ? ` from ${test.cwd}` : ""} first.`,
      reason: "A test command was detected from repo evidence."
    });
  } else {
    suggested.push({
      claim: "Identify and document the test command.",
      reason: "Kanon could not find a current test command."
    });
  }
  if (input.verification.issues.length > 0) {
    suggested.push({
      claim: "Fix or confirm README drift before trusting setup instructions.",
      reason:
        `${input.verification.issues.length} suspicious README claim(s) were detected.`
    });
  }
  if (!input.ci.found) {
    suggested.push({
      claim: "Add CI once the local test command is verified.",
      reason: "No CI evidence was found."
    });
  }
  if (input.todos.length > 0) {
    suggested.push({
      claim: `Review ${input.todos.length} TODO/FIXME marker(s).`,
      reason: "Inline work markers were detected in repo files."
    });
  }
  const entrypoint = input.likelyEntrypoints[0];
  if (entrypoint) {
    suggested.push({
      claim: `Inspect ${entrypoint.claim.split(/\s+/)[0]} next.`,
      reason: "It appears to be the main entrypoint."
    });
  }
}

function paths(items) {
  return items.map((file) => file.path).join(", ");
}
