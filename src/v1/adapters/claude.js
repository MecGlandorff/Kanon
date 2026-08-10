import {
  normalizeAdapterInvocationContext
} from "./shared.js";

/**
 * @param {unknown} input
 * @param {unknown} [context]
 * @returns {Promise<import("../skills/invoke.js").StableSkillResult>}
 */
export async function invokeClaudeSkill(input, context = {}) {
  const { executeStableInvocation } = await import("../skills/invoke.js");
  return executeStableInvocation(input, {
    host: "claude-code",
    ...normalizeAdapterInvocationContext(context)
  });
}
