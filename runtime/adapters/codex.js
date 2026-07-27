import { createNoticeOutput } from "../core/notice.js";
import { normalizeHookInput } from "./shared.js";

const CODEX_OPERATIONS = Object.freeze({
  Bash: "shell",
  Edit: "mutation",
  Write: "mutation",
  apply_patch: "mutation"
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
 * }} CodexAdapterResult
 */

/**
 * @param {unknown} input
 * @returns {CodexAdapterResult}
 */
export function adaptCodexNotice(input) {
  const normalized = normalizeHookInput(
    input,
    "codex-cli",
    CODEX_OPERATIONS
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
