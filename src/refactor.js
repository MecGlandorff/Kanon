import path from "node:path";
import { readText, scanRepo } from "./scanner.js";

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

const CODE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".go",
  ".java",
  ".js",
  ".jsx",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue"
]);

const CONFIG_EXTENSIONS = new Set([".json", ".toml", ".yaml", ".yml", ".ini", ".cfg", ".conf"]);
const TEST_PATH = /(^|\/)(test|tests|__tests__)\//;
const TEST_NAME = /\.(test|spec)\.[cm]?[jt]sx?$|test_.*\.py$|_test\.py$/;
const IMPACT_WEIGHT = { high: 3, medium: 2, low: 1 };
const RISK_WEIGHT = { low: 3, medium: 2, high: 1 };

export function normalizeRefactorMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const mode = MODE_ALIASES.get(normalized);
  if (!mode) {
    throw new Error("Invalid refactor mode. Use plan, audit, prompt, or choose 1, 2, or 3.");
  }
  return mode;
}

export function normalizeRefactorAgent(value) {
  const normalized = String(value || "generic").trim().toLowerCase();
  const agent = AGENT_ALIASES.get(normalized);
  if (!agent) {
    throw new Error("Invalid refactor agent. Use generic, codex, or claude.");
  }
  return agent;
}

export function defaultRefactorAnswers() {
  return Object.fromEntries(REFACTOR_QUESTIONS.map((question) => [question.id, question.default]));
}

export function buildRefactorPlan(analysis, options = {}) {
  const root = analysis.root;
  const scanned = scanRepo(root, { maxFiles: 2500 });
  const answers = { ...defaultRefactorAnswers(), ...(options.answers || {}) };
  const agent = normalizeRefactorAgent(options.agent || "generic");
  const fileMetrics = collectFileMetrics(root, scanned.files);
  const duplicationFamilies = detectRepeatedFileFamilies(fileMetrics);
  const hotspots = rankHotspots([
    ...fileMetrics.flatMap((metric) => fileHotspots(metric)),
    ...duplicationFamilies,
    ...deadCodeHotspots(fileMetrics, analysis.state)
  ]);
  const primary = hotspots[0] || null;
  const secondary = hotspots.slice(1, 4);
  const plan = buildOneSessionPlan(analysis.state, primary, secondary, answers);
  const doNotTouch = buildDoNotTouch(answers);
  const deletionPolicy = buildDeletionPolicy(answers);
  const agentPrompt = buildAgentPrompt({
    analysis,
    agent,
    answers,
    primary,
    secondary,
    plan,
    doNotTouch,
    deletionPolicy
  });

  return {
    generated_at: analysis.state.generated_at,
    agent,
    answers,
    questions: REFACTOR_QUESTIONS,
    summary: {
      hotspots: hotspots.length,
      primary_target: primary?.target || null,
      one_session: true
    },
    hotspots,
    plan,
    do_not_touch: doNotTouch,
    deletion_policy: deletionPolicy,
    agent_prompt: agentPrompt
  };
}

function collectFileMetrics(root, files) {
  const metrics = [];
  const allTexts = new Map();

  for (const file of files) {
    if (!file.text) {
      continue;
    }
    const kind = classifyFile(file);
    const text = readText(root, file.path, { limit: 300_000 });
    allTexts.set(file.path, text);
    metrics.push(analyzeFile(file, text, kind));
  }

  const referenceIndex = buildReferenceIndex(metrics, allTexts);
  for (const metric of metrics) {
    metric.reference_count = referenceIndex.get(metric.path) || 0;
  }

  return metrics;
}

function analyzeFile(file, text, kind) {
  const lines = text.split(/\r?\n/);
  const nonBlank = lines.filter((line) => line.trim()).length;
  const normalizedLines = lines.map(normalizeCodeLine).filter(Boolean);
  const duplicateLines = normalizedLines.length - new Set(normalizedLines).size;
  const functionLike = countMatches(text, functionPattern(file.extension));
  const branchCount = countMatches(text, /\b(if|else if|for|while|switch|case|catch|try)\b|&&|\|\|/g);
  const exportCount = countMatches(text, /\bexport\b|module\.exports|exports\./g);
  const importCount = countMatches(text, /\bimport\b|\brequire\s*\(|\bfrom\s+[A-Za-z0-9_.]+\s+import\b/g);
  const todoCount = countWorkMarkers(lines);
  const longLines = lines.filter((line) => line.length > 120).length;
  const vagueNames = countMatches(text, /\b(doStuff|handleStuff|processData|someData|tempData|thing|things|stuff|misc|utils?)\b/g);

  return {
    path: file.path,
    basename: file.basename,
    extension: file.extension,
    size: file.size,
    kind,
    lines: lines.length,
    non_blank_lines: nonBlank,
    duplicate_lines: duplicateLines,
    duplicate_ratio: normalizedLines.length ? duplicateLines / normalizedLines.length : 0,
    function_like_count: functionLike,
    branch_count: branchCount,
    export_count: exportCount,
    import_count: importCount,
    todo_count: todoCount,
    long_lines: longLines,
    vague_name_count: vagueNames,
    reference_count: 0
  };
}

function classifyFile(file) {
  if (TEST_PATH.test(file.path) || TEST_NAME.test(file.path)) {
    return "test";
  }
  if (CODE_EXTENSIONS.has(file.extension) || file.basename === "Makefile") {
    return "source";
  }
  if (CONFIG_EXTENSIONS.has(file.extension) || ["Dockerfile", "Procfile"].includes(file.basename)) {
    return "config";
  }
  if (file.extension === ".md" || file.extension === ".txt") {
    return "docs";
  }
  return "other";
}

function fileHotspots(metric) {
  const hotspots = [];
  if (!["source", "test", "config"].includes(metric.kind)) {
    return hotspots;
  }

  const reasons = [];
  let impact = "low";
  let risk = "low";

  if (metric.kind === "source" && metric.lines >= 500) {
    reasons.push(`${metric.path} has ${metric.lines} lines, which is a readability risk for a source file.`);
    impact = "high";
    risk = "medium";
  } else if (metric.kind === "source" && metric.lines >= 300) {
    reasons.push(`${metric.path} has ${metric.lines} lines and should be checked for multiple responsibilities.`);
    impact = "medium";
  } else if (metric.kind === "test" && metric.lines >= 600) {
    reasons.push(`${metric.path} has ${metric.lines} lines, which can make test intent hard to scan.`);
    impact = "medium";
  }

  if (metric.branch_count >= 90) {
    reasons.push(`${metric.path} has ${metric.branch_count} branch-like tokens, suggesting high control-flow density.`);
    impact = impact === "high" ? "high" : "medium";
    risk = "medium";
  }

  if (metric.duplicate_ratio >= 0.18 && metric.duplicate_lines >= 20) {
    reasons.push(`${metric.path} has repeated normalized lines that may hide copy-pasted logic.`);
    impact = impact === "low" ? "medium" : impact;
  }

  if (metric.export_count >= 10 || metric.function_like_count >= 25) {
    reasons.push(`${metric.path} exposes or defines many units; it may be carrying too many responsibilities.`);
    impact = impact === "low" ? "medium" : impact;
  }

  if (metric.todo_count >= 3) {
    reasons.push(`${metric.path} contains ${metric.todo_count} TODO/FIXME/HACK markers.`);
    impact = impact === "low" ? "medium" : impact;
  }

  if (metric.long_lines >= 12) {
    reasons.push(`${metric.path} has ${metric.long_lines} lines over 120 characters, reducing scanability.`);
    impact = impact === "low" ? "medium" : impact;
  }

  if (metric.vague_name_count >= 5) {
    reasons.push(`${metric.path} has repeated vague naming signals often seen in rushed or vibecoded code.`);
    impact = impact === "low" ? "medium" : impact;
  }

  if (!reasons.length) {
    return hotspots;
  }

  hotspots.push({
    id: `file.${slug(metric.path)}`,
    type: "file",
    target: metric.path,
    title: `Simplify ${metric.path}`,
    reasons,
    suggested_action: suggestedActionForMetric(metric),
    payoff: impact,
    risk,
    confidence: "likely",
    evidence: [
      `${metric.path}: ${metric.lines} lines`,
      `${metric.path}: ${metric.function_like_count} function-like unit(s)`,
      `${metric.path}: ${metric.branch_count} branch-like token(s)`
    ]
  });

  return hotspots;
}

function detectRepeatedFileFamilies(metrics) {
  const groups = new Map();
  for (const metric of metrics) {
    if (!["source", "config"].includes(metric.kind)) {
      continue;
    }
    const dir = path.posix.dirname(metric.path);
    const key = `${dir}:${metric.extension || metric.basename}`;
    const items = groups.get(key) || [];
    items.push(metric);
    groups.set(key, items);
  }

  const hotspots = [];
  for (const items of groups.values()) {
    if (items.length < 4) {
      continue;
    }
    const average = items.reduce((sum, item) => sum + item.lines, 0) / items.length;
    const similar = items.filter((item) => Math.abs(item.lines - average) <= Math.max(8, average * 0.35));
    if (similar.length < 4) {
      continue;
    }
    hotspots.push({
      id: `family.${slug(path.posix.dirname(similar[0].path))}.${slug(similar[0].extension || similar[0].basename)}`,
      type: "repeated-family",
      target: path.posix.dirname(similar[0].path),
      title: `Consolidate repeated file pattern in ${path.posix.dirname(similar[0].path)}`,
      reasons: [
        `${similar.length} similarly sized ${similar[0].extension || similar[0].basename} files were found in the same directory.`,
        "This is a good candidate for a manifest, generator, shared helper, or documented pattern."
      ],
      suggested_action: "Create one source of truth for the repeated pattern, then regenerate or simplify the individual files.",
      payoff: "medium",
      risk: "medium",
      confidence: "likely",
      evidence: similar.slice(0, 8).map((item) => `${item.path}: ${item.lines} lines`)
    });
  }
  return hotspots;
}

function deadCodeHotspots(metrics, state) {
  const entrypointPaths = new Set(
    [
      ...state.important_files.map((file) => file.path),
      ...Object.values(state.commands)
        .flat()
        .map((command) => command.detail)
        .filter(Boolean)
        .map((detail) => String(detail).replace(/^\.\//, ""))
    ]
  );
  const candidates = metrics.filter((metric) =>
    metric.kind === "source" &&
    metric.reference_count === 0 &&
    !entrypointPaths.has(metric.path) &&
    !TEST_PATH.test(metric.path) &&
    !TEST_NAME.test(metric.path)
  );

  return candidates.slice(0, 6).map((metric) => ({
    id: `dead-code.${slug(metric.path)}`,
    type: "dead-code-candidate",
    target: metric.path,
    title: `Verify whether ${metric.path} is dead code`,
    reasons: [
      "No text references to this file stem were found outside the file itself.",
      "This is a deletion candidate only after user confirmation and test verification."
    ],
    suggested_action: "Ask the user before deleting; then remove only if imports, tests, docs, and runtime paths stay clean.",
    payoff: "low",
    risk: "high",
    confidence: "likely",
    evidence: [`${metric.path}: 0 text reference(s) to file stem outside itself`]
  }));
}

function buildReferenceIndex(metrics, allTexts) {
  const index = new Map();
  for (const metric of metrics) {
    if (metric.kind !== "source") {
      continue;
    }
    const stem = path.basename(metric.path, metric.extension).toLowerCase();
    if (!stem || stem.length < 4) {
      continue;
    }
    let count = 0;
    for (const [filePath, text] of allTexts.entries()) {
      if (filePath === metric.path) {
        continue;
      }
      if (text.toLowerCase().includes(stem)) {
        count += 1;
      }
    }
    index.set(metric.path, count);
  }
  return index;
}

function buildOneSessionPlan(state, primary, secondary, answers) {
  const testCommand = state.commands.test[0]?.command || null;
  const steps = [];

  steps.push("Confirm the user steering answers and keep the refactor within one agent session.");
  if (primary) {
    steps.push(`Inspect ${primary.target} and the nearest tests before editing.`);
  } else {
    steps.push("Inspect the highest-value source area manually; Kanon did not detect a strong hotspot.");
  }
  steps.push(
    testCommand
      ? `Add or update characterization tests around the selected behavior, then run \`${testCommand}\`.`
      : "Identify a minimal manual verification path before editing because no test command was detected."
  );
  if (primary) {
    steps.push(`Refactor ${primary.target} in small commits or patches: split responsibilities, remove duplication, and preserve behavior.`);
  }
  if (secondary.length) {
    steps.push(`Apply only low-risk cleanup to secondary targets: ${secondary.map((item) => item.target).join(", ")}.`);
  }
  steps.push("Ask the user before deleting any dead-code candidate, then verify references and tests before removal.");
  steps.push(testCommand ? `Run \`${testCommand}\` again and summarize behavior preserved.` : "Document the manual verification performed.");

  return {
    goal: answers.goal,
    primary_target: primary,
    secondary_targets: secondary,
    steps
  };
}

function buildDoNotTouch(answers) {
  return [
    answers.protect,
    "Generated files, lockfiles, migrations, deployment configuration, and public interfaces unless the user explicitly allows it.",
    "Unrelated style churn outside the selected refactor target."
  ];
}

function buildDeletionPolicy(answers) {
  return {
    user_answer: answers.delete_dead_code,
    rule: "Deletion is allowed only after the agent asks the user about the specific candidate and verifies no imports, tests, docs, or runtime paths still depend on it."
  };
}

function buildAgentPrompt(input) {
  const agentName = input.agent === "codex" ? "Codex" : input.agent === "claude" ? "Claude Code" : "coding agent";
  const lines = [];
  lines.push(`You are ${agentName}. Use this Kanon refactor plan to clean up messy or vibecoded code safely.`);
  lines.push("");
  lines.push("Before editing, ask or confirm these answers:");
  for (const question of REFACTOR_QUESTIONS) {
    lines.push(`- ${question.prompt} Current/default: ${input.answers[question.id]}`);
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
    lines.push("Primary target: choose the strongest source-code hotspot after a short inspection.");
  }
  if (input.secondary.length) {
    lines.push(`Secondary targets: ${input.secondary.map((item) => item.target).join(", ")}`);
  }
  lines.push("");
  lines.push("One-session implementation plan:");
  input.plan.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });
  lines.push("");
  lines.push("Do not start broad rewrites. Present the plan first if the user has not approved implementation.");
  return lines.join("\n");
}

function suggestedActionForMetric(metric) {
  if (metric.kind === "test") {
    return "Split broad test setup from focused assertions and name scenarios after behavior.";
  }
  if (metric.duplicate_ratio >= 0.18) {
    return "Extract repeated logic into a shared helper or small module after adding characterization coverage.";
  }
  if (metric.export_count >= 10 || metric.function_like_count >= 25) {
    return "Split the file by responsibility and keep public exports stable during the first pass.";
  }
  return "Make the file easier to scan by extracting focused helpers and reducing mixed responsibilities.";
}

function rankHotspots(hotspots) {
  return hotspots
    .slice()
    .sort((a, b) => {
      const payoff = IMPACT_WEIGHT[b.payoff] - IMPACT_WEIGHT[a.payoff];
      if (payoff) {
        return payoff;
      }
      const risk = RISK_WEIGHT[b.risk] - RISK_WEIGHT[a.risk];
      if (risk) {
        return risk;
      }
      return a.target.localeCompare(b.target);
    });
}

function normalizeCodeLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 24 || /^\/\/|^#|^\/\*|^\*|^<!--/.test(trimmed)) {
    return "";
  }
  return trimmed.replace(/\s+/g, " ");
}

function functionPattern(extension) {
  if (extension === ".py") {
    return /^\s*(def|class)\s+[A-Za-z0-9_]+/gm;
  }
  if ([".js", ".jsx", ".mjs", ".ts", ".tsx"].includes(extension)) {
    return /\b(function|class)\s+[A-Za-z0-9_$]+|=>/g;
  }
  return /\b(function|class|def|fn)\b/g;
}

function countMatches(text, pattern) {
  return [...String(text || "").matchAll(pattern)].length;
}

function countWorkMarkers(lines) {
  return lines.filter((line) =>
    /(?:^|\s)(?:\/\/|#|\/\*|\*)\s*\b(TODO|FIXME|HACK|XXX)\b(?::|\s)/i.test(line) ||
    /^\s*-\s*\b(TODO|FIXME|HACK|XXX)\b(?::|\s)/i.test(line)
  ).length;
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
