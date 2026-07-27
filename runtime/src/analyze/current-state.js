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
  addCommands(
    state,
    input.commands,
    input.configuration.command_execution
  );
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
      evidence: issue.evidence,
      trust: "repository-untrusted"
    });
  }
  for (const observation of input.verification.unknowns || []) {
    state.unknown.push({
      claim: observation.claim,
      reason: observation.observation,
      evidence: observation.evidence,
      trust: "repository-untrusted"
    });
  }
  if (input.configuration.warning) {
    state.unknown.push({
      claim: ".kanon/config.json is invalid and was ignored.",
      reason: input.configuration.warning,
      evidence: input.configuration.evidence,
      trust: "kanon-generated"
    });
  }
  addSuggestions(state.suggested, input);
  return state;
}

function addPurpose(state, purpose) {
  if (purpose.confidence === "known") {
    state.known.push({
      claim: `Repo purpose: ${purpose.claim}`,
      evidence: purpose.evidence,
      trust: "repository-untrusted"
    });
  } else if (purpose.confidence === "likely") {
    state.likely.push({
      claim: `Declared repo purpose: ${purpose.claim}`,
      evidence: purpose.evidence,
      trust: "repository-untrusted"
    });
  }
}

function addCommands(state, commands, executionPolicy) {
  for (const group of ["test", "run", "build", "dev"]) {
    for (const command of commands[group]) {
      state[command.confidence === "known" ? "known" : "likely"].push({
        claim: `A ${group} command candidate is directly declared; execution success is Unknown.`,
        reason:
          "The candidate value is retained only in the structured command-data section. " +
          (
            executionPolicy === "never"
              ? "Current Kanon policy prohibits execution."
              : "Kanon policy requires definition review and user approval before execution."
          ),
        evidence: command.evidence,
        trust: "kanon-generated"
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
      evidence: input.tests.evidence,
      trust: "repository-untrusted"
    });
  }
  if (input.ci.found) {
    known.push({
      claim: `CI configuration found: ${paths(input.ci.files)}.`,
      evidence: input.ci.files.map((file) => file.evidence),
      trust: "repository-untrusted"
    });
  }
  if (input.deploy.found) {
    known.push({
      claim: `Deployment/runtime configuration found: ${paths(input.deploy.files)}.`,
      evidence: input.deploy.files.map((file) => file.evidence),
      trust: "repository-untrusted"
    });
  }
  if (input.git.found && input.git.dirty !== null) {
    known.push({
      claim:
        `Git repository${input.git.branch ? ` on branch ${input.git.branch}` : ""}; ` +
        `${input.git.change_count} working-tree change(s).`,
      evidence: input.git.evidence,
      trust: "repository-untrusted"
    });
  } else if (input.git.found) {
    known.push({
      claim: "Git repository metadata was detected.",
      evidence: input.git.evidence,
      trust: "kanon-generated"
    });
  }
}

function addUnknowns(unknown, input) {
  if (!input.commands.test.length) {
    unknown.push({
      claim: "Current checks did not observe an explicit test command.",
      reason:
        "No package test script, test task, or documented test command was " +
        `observed.${limitationSuffix(input)}`
    });
  }
  if (!input.git.observation_complete) {
    unknown.push({
      claim: "Git state is Unknown.",
      reason: input.git.diagnostics
        .map((item) => item.message)
        .filter(Boolean)
        .join(" ") || "Git observation did not complete.",
      evidence: input.git.evidence
    });
  }
  if (!input.ci.found) {
    unknown.push({
      claim: "Current checks did not observe conventional CI configuration.",
      reason:
        "No GitHub Actions, GitLab CI, CircleCI, or similar CI config was " +
        `observed.${limitationSuffix(input)}`
    });
  }
  if (!input.deploy.found) {
    unknown.push({
      claim:
        "Current checks did not observe conventional deployment configuration.",
      reason:
        "No Dockerfile, Procfile, platform config, or compose file was " +
        `observed.${limitationSuffix(input)}`
    });
  }
  if (!input.release.found) {
    unknown.push({
      claim:
        "Current checks did not observe a conventional release workflow or changelog.",
      reason:
        "No release workflow, releaserc, or CHANGELOG.md was " +
        `observed.${limitationSuffix(input)}`
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
  const limitation = limitationSuffix(input);
  if (input.commands.test.length) {
    const test = input.commands.test[0];
    suggested.push({
      claim:
        input.configuration.command_execution === "never"
          ? "Keep the declared test candidate unexecuted under current policy."
          : "Review the declared test candidate before any execution.",
      reason:
        "The candidate value is shown only in the structured command-data section. " +
        (
          input.configuration.command_execution === "never"
            ? "Kanon has not executed it and current policy prohibits execution."
            : "Kanon has not executed it; user approval is required."
        ),
      trust: "kanon-generated"
    });
  } else {
    suggested.push({
      claim: "Identify and document the test command.",
      reason:
        `Kanon did not observe an explicit test command.${limitation}`
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
      reason:
        `No conventional CI configuration was observed.${limitation}`
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
      claim: "Review the likely entrypoint next.",
      reason:
        "The repository-derived path is listed separately under important files and entrypoint evidence.",
      trust: "kanon-generated"
    });
  }
}

function limitationSuffix(input) {
  const reasons = [];
  if (!input.scan.complete) {
    reasons.push(scanLimitationReason(input.scan));
  }
  if (input.scan.sensitive_files_skipped > 0) {
    reasons.push("Sensitive files were intentionally excluded.");
  }
  return reasons.length
    ? ` Limitation: ${reasons.join(" ")}`
    : "";
}

function paths(items) {
  return items.map((file) => file.path).join(", ");
}
