import {
  normalizeAdapterInvocationContext
} from "./shared.js";

/**
 * @param {unknown} input
 * @param {unknown} [context]
 * @returns {Promise<import("../skills/invoke.js").StableSkillResult>}
 */
export async function invokeCodexSkill(input, context = {}) {
  const { executeStableInvocation } = await import("../skills/invoke.js");
  return executeStableInvocation(input, {
    host: "codex-cli",
    ...normalizeAdapterInvocationContext(context)
  });
}
