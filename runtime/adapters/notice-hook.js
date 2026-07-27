import { adaptClaudeNotice } from "./claude.js";
import { adaptCodexNotice } from "./codex.js";

const MAX_HOOK_INPUT_BYTES = 64 * 1024;
const INVALID_NOTICE =
  "Kanon notice input was unavailable or invalid; host hook state remains Unknown.\n";

const read = await readBoundedStdin(process.stdin);
if (!read.ok) {
  process.stderr.write(INVALID_NOTICE);
} else {
  const parsed = parseJson(read.text);
  const host = selectHost(process.env);
  const adapted =
    host === "codex-cli"
      ? adaptCodexNotice(parsed)
      : host === "claude-code"
        ? adaptClaudeNotice(parsed)
        : unknownHost();

  if (adapted.ok) {
    process.stdout.write(`${JSON.stringify(adapted.output)}\n`);
  } else {
    process.stderr.write(INVALID_NOTICE);
  }
}

/**
 * @param {NodeJS.ReadableStream} stream
 * @returns {Promise<
 *   {ok: true, text: string} |
 *   {ok: false, status: "Unknown"}
 * >}
 */
async function readBoundedStdin(stream) {
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  let exceeded = false;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk));
      size += bytes.length;
      if (size > MAX_HOOK_INPUT_BYTES) {
        exceeded = true;
        continue;
      }
      chunks.push(bytes);
    }
  } catch {
    return { ok: false, status: "Unknown" };
  }
  if (exceeded || size === 0) {
    return { ok: false, status: "Unknown" };
  }
  return {
    ok: true,
    text: Buffer.concat(chunks, size).toString("utf8")
  };
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {NodeJS.ProcessEnv} environment
 * @returns {"codex-cli" | "claude-code" | "unknown"}
 */
function selectHost(environment) {
  if (isBoundedEnvironmentPath(environment.PLUGIN_ROOT)) {
    return "codex-cli";
  }
  if (isBoundedEnvironmentPath(environment.CLAUDE_PLUGIN_ROOT)) {
    return "claude-code";
  }
  return "unknown";
}

/**
 * @param {string | undefined} value
 * @returns {boolean}
 */
function isBoundedEnvironmentPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 8_192;
}

/**
 * @returns {import("./codex.js").CodexAdapterResult}
 */
function unknownHost() {
  return {
    ok: false,
    status: "Unknown",
    diagnostic: INVALID_NOTICE.trim()
  };
}
