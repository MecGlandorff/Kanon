/**
 * Fixed host output for the stable advisory mode. The shape intentionally
 * excludes every host field that could deny, rewrite, approve, or suppress an
 * operation.
 */
export const NOTICE_MESSAGE =
  "Kanon is in advisory notice mode. Context readiness is not enforced, and this notice does not indicate that repository context was read or understood.";

/**
 * @typedef {{systemMessage: string}} NoticeOutput
 */

/**
 * @returns {NoticeOutput}
 */
export function createNoticeOutput() {
  return {
    systemMessage: NOTICE_MESSAGE
  };
}
