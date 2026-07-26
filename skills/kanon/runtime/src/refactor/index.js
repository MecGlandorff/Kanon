import { scanRepo } from "../scanner.js";
import {
  deadCodeHotspots,
  detectRepeatedFileFamilies,
  fileHotspots,
  rankHotspots
} from "./hotspots.js";
import { collectFileMetrics } from "./metrics.js";
import {
  defaultRefactorAnswers,
  normalizeRefactorAgent,
  normalizeRefactorMode,
  REFACTOR_AGENTS,
  REFACTOR_MODES,
  REFACTOR_QUESTIONS
} from "./policy.js";
import {
  buildAgentPrompt,
  buildDeletionPolicy,
  buildDoNotTouch,
  buildOneSessionPlan
} from "./plan.js";

export {
  defaultRefactorAnswers,
  normalizeRefactorAgent,
  normalizeRefactorMode,
  REFACTOR_AGENTS,
  REFACTOR_MODES,
  REFACTOR_QUESTIONS
};

export function buildRefactorPlan(analysis, options = {}) {
  const root = analysis.root;
  const scanned = scanRepo(root, {
    maxFiles: analysis.state.scan?.max_files ?? 2500,
    maxFileBytes: analysis.state.scan?.max_file_bytes,
    useGitIgnore: analysis.state.scan?.strategy === "git",
    ...(options.scan || {})
  });
  const answers = {
    ...defaultRefactorAnswers(),
    ...(options.answers || {})
  };
  const agent = normalizeRefactorAgent(options.agent || "generic");
  const fileMetrics = collectFileMetrics(root, scanned.files);
  const duplicationFamilies = detectRepeatedFileFamilies(fileMetrics);
  const hotspots = rankHotspots([
    ...fileMetrics.flatMap((metric) => fileHotspots(metric)),
    ...duplicationFamilies,
    ...(scanned.diagnostics.complete
      ? deadCodeHotspots(fileMetrics, analysis.state)
      : [])
  ]);
  const primary = hotspots[0] || null;
  const secondary = hotspots.slice(1, 4);
  const plan = buildOneSessionPlan(
    analysis.state,
    primary,
    secondary,
    answers,
    scanned.diagnostics
  );
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
      one_session: true,
      scan_complete: scanned.diagnostics.complete
    },
    scan: scanned.diagnostics,
    hotspots,
    plan,
    do_not_touch: doNotTouch,
    deletion_policy: deletionPolicy,
    agent_prompt: agentPrompt
  };
}
