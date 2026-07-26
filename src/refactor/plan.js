import { REFACTOR_QUESTIONS } from "./policy.js";

export function buildOneSessionPlan(
  state,
  primary,
  secondary,
  answers,
  scan
) {
  const testCommand = state.commands.test[0]?.command || null;
  const steps = [];

  steps.push(
    "Confirm the user steering answers and keep the refactor within one agent session."
  );
  if (!scan.complete) {
    steps.push(
      "Treat detected hotspots as partial because the repository scan was incomplete; do not infer dead code from missing references."
    );
  }
  if (primary) {
    steps.push(
      `Inspect ${primary.target} and the nearest tests before editing.`
    );
  } else {
    steps.push(
      "Inspect the highest-value source area manually; Kanon did not detect a strong hotspot."
    );
  }
  steps.push(
    testCommand
      ? `Add or update characterization tests around the selected behavior, then run \`${testCommand}\`.`
      : "Identify a minimal manual verification path before editing because no test command was detected."
  );
  if (primary) {
    steps.push(
      `Refactor ${primary.target} in small commits or patches: split responsibilities, remove duplication, and preserve behavior.`
    );
  }
  if (secondary.length) {
    steps.push(
      `Apply only low-risk cleanup to secondary targets: ${secondary.map((item) => item.target).join(", ")}.`
    );
  }
  steps.push(
    "Ask the user before deleting any dead-code candidate, then verify references and tests before removal."
  );
  steps.push(
    testCommand
      ? `Run \`${testCommand}\` again and summarize behavior preserved.`
      : "Document the manual verification performed."
  );

  return {
    goal: answers.goal,
    primary_target: primary,
    secondary_targets: secondary,
    steps
  };
}

export function buildDoNotTouch(answers) {
  return [
    answers.protect,
    "Generated files, lockfiles, migrations, deployment configuration, and public interfaces unless the user explicitly allows it.",
    "Unrelated style churn outside the selected refactor target."
  ];
}

export function buildDeletionPolicy(answers) {
  return {
    user_answer: answers.delete_dead_code,
    rule: "Deletion is allowed only after the agent asks the user about the specific candidate and verifies no imports, tests, docs, or runtime paths still depend on it."
  };
}

export function buildAgentPrompt(input) {
  const agentName = input.agent === "codex"
    ? "Codex"
    : input.agent === "claude"
      ? "Claude Code"
      : "coding agent";
  const lines = [];
  lines.push(
    `You are ${agentName}. Use this Kanon refactor plan to clean up messy or vibecoded code safely.`
  );
  lines.push("");
  lines.push("Before editing, ask or confirm these answers:");
  for (const question of REFACTOR_QUESTIONS) {
    lines.push(
      `- ${question.prompt} Current/default: ${input.answers[question.id]}`
    );
  }
  lines.push("");
  lines.push("Constraints:");
  for (const item of input.doNotTouch) {
    lines.push(`- Do not touch: ${item}`);
  }
  lines.push(`- Deletion rule: ${input.deletionPolicy.rule}`);
  lines.push("");
  if (input.primary) {
    lines.push(`Primary target: ${input.primary.target}`);
    lines.push(`Why: ${input.primary.reasons.join(" ")}`);
  } else {
    lines.push(
      "Primary target: choose the strongest source-code hotspot after a short inspection."
    );
  }
  if (input.secondary.length) {
    lines.push(
      `Secondary targets: ${input.secondary.map((item) => item.target).join(", ")}`
    );
  }
  lines.push("");
  lines.push("One-session implementation plan:");
  input.plan.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });
  lines.push("");
  lines.push(
    "Do not start broad rewrites. Present the plan first if the user has not approved implementation."
  );
  return lines.join("\n");
}
