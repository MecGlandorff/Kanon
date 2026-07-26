export const REFACTOR_MODES = new Set(["plan", "audit", "prompt"]);
export const REFACTOR_AGENTS = new Set(["generic", "codex", "claude"]);

const MODE_ALIASES = new Map([
  ["1", "plan"],
  ["plan", "plan"],
  ["2", "audit"],
  ["audit", "audit"],
  ["hotspots", "audit"],
  ["3", "prompt"],
  ["prompt", "prompt"]
]);

const AGENT_ALIASES = new Map([
  ["generic", "generic"],
  ["agent", "generic"],
  ["codex", "codex"],
  ["openai", "codex"],
  ["claude", "claude"],
  ["claude-code", "claude"]
]);

export const REFACTOR_QUESTIONS = [
  {
    id: "goal",
    prompt: "What is the main refactor goal?",
    default: "Simplify messy or vibecoded code while preserving current behavior."
  },
  {
    id: "protect",
    prompt: "What must not break?",
    default: "Public APIs, CLI behavior, tests, package/config files, generated files, and deployment settings."
  },
  {
    id: "delete_dead_code",
    prompt: "May the plan include deleting dead code after asking you first?",
    default: "Ask before deleting any candidate dead code."
  },
  {
    id: "tests",
    prompt: "Should tests be added before risky refactors?",
    default: "Add or update characterization tests before risky refactors."
  },
  {
    id: "scope",
    prompt: "Should this fit one agent session?",
    default: "One main refactor target plus small cleanup targets in one agent session."
  }
];

export function normalizeRefactorMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const mode = MODE_ALIASES.get(normalized);
  if (!mode) {
    throw new Error(
      "Invalid refactor mode. Use plan, audit, prompt, or choose 1, 2, or 3."
    );
  }
  return mode;
}

export function normalizeRefactorAgent(value) {
  const normalized = String(value || "generic").trim().toLowerCase();
  const agent = AGENT_ALIASES.get(normalized);
  if (!agent) {
    throw new Error(
      "Invalid refactor agent. Use generic, codex, or claude."
    );
  }
  return agent;
}

export function defaultRefactorAnswers() {
  return Object.fromEntries(
    REFACTOR_QUESTIONS.map(
      (question) => [question.id, question.default]
    )
  );
}
