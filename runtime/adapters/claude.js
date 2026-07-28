import { createNoticeOutput } from "../core/notice.js";
import {
  normalizeAdapterInvocationContext,
  normalizeHookInput
} from "./shared.js";

const CLAUDE_OPERATIONS = Object.freeze({
  Bash: "shell",
  Edit: "mutation",
  Write: "mutation"
});

/**
 * @typedef {import("./shared.js").NormalizedHostEvent} NormalizedHostEvent
 * @typedef {import("../core/notice.js").NoticeOutput} NoticeOutput
 * @typedef {{
 *   ok: true,
 *   event: NormalizedHostEvent,
 *   output: NoticeOutput
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} ClaudeAdapterResult
 */

/**
 * @param {unknown} input
 * @returns {ClaudeAdapterResult}
 */
export function adaptClaudeNotice(input) {
  const normalized = normalizeHookInput(
    input,
    "claude-code",
    CLAUDE_OPERATIONS
  );
  if (!normalized.ok) {
    return normalized;
  }
  return {
    ok: true,
    event: normalized.value,
    output: createNoticeOutput()
  };
}

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
