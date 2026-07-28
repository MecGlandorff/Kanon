import crypto from "node:crypto";
import path from "node:path";
import { invokeClaudeSkill } from "./adapters/claude.js";
import { invokeCodexSkill } from "./adapters/codex.js";
import { readEmbeddedBuildMetadata } from "./core/build-metadata.js";
import {
  isBoundedString,
  sanitizeDisplayText
} from "./core/trust.js";
import { executeStableInvocation } from "./skills/invoke.js";

const MAX_ARGUMENTS = 64;
const MAX_ARGUMENT_BYTES = 16 * 1024;
const MAX_RECEIPT_INPUT_BYTES = 16 * 1024;

/**
 * @typedef {{
 *   command: string | null,
 *   positionals: string[],
 *   flags: {
 *     json: boolean,
 *     help: boolean,
 *     version: boolean,
 *     receipt_stdin: boolean,
 *     root: string | null,
 *     task: string | null
 *   }
 * }} ParsedArguments
 * @typedef {{
 *   stdin?: NodeJS.ReadableStream,
 *   stdout?: {write: (text: string) => unknown},
 *   environment?: NodeJS.ProcessEnv
 * }} CliIo
 */

/**
 * @param {unknown} argvInput
 * @param {CliIo} [ioInput]
 * @returns {Promise<void>}
 */
export async function runStableCli(argvInput, ioInput = {}) {
  const argv = validateArgv(argvInput);
  const parsed = parseArguments(argv);
  const stdout = ioInput.stdout || process.stdout;
  const environment = ioInput.environment || process.env;
  if (parsed.flags.version) {
    const metadata = readEmbeddedBuildMetadata();
    stdout.write(`${metadata.ok ? metadata.value.package_version : "Unknown"}\n`);
    return;
  }
  if (parsed.flags.help || parsed.command === null) {
    stdout.write(helpText());
    return;
  }
  const routed = routeCommand(parsed);
  const receipt = parsed.flags.receipt_stdin
    ? await readReceipt(ioInput.stdin || process.stdin)
    : undefined;
  const invocation = {
    schema: /** @type {"kanon-stable-invocation-v1"} */ (
      "kanon-stable-invocation-v1"
    ),
    skill: routed.skill,
    root: path.resolve(parsed.flags.root || process.cwd()),
    ...(routed.task === undefined ? {} : { task: routed.task }),
    ...(routed.target === undefined ? {} : { target: routed.target }),
    ...(receipt === undefined ? {} : { receipt })
  };
  const host = selectHost(environment);
  const result =
    host === "codex-cli"
      ? await invokeCodexSkill(invocation)
      : host === "claude-code"
        ? await invokeClaudeSkill(invocation)
        : await executeStableInvocation(invocation, { host: "Unknown" });
  stdout.write(
    parsed.flags.json
      ? `${JSON.stringify(result)}\n`
      : renderStableResult(result)
  );
}

/**
 * @param {unknown} input
 * @returns {string[]}
 */
function validateArgv(input) {
  if (
    !Array.isArray(input) ||
    input.length > MAX_ARGUMENTS ||
    input.some(
      (value) =>
        typeof value !== "string" ||
        value.length > 8_192
    ) ||
    Buffer.byteLength(input.join("\0")) > MAX_ARGUMENT_BYTES
  ) {
    throw new Error("Kanon arguments were unavailable or invalid.");
  }
  return input;
}

/**
 * @param {string[]} argv
 * @returns {ParsedArguments}
 */
function parseArguments(argv) {
  /** @type {ParsedArguments["flags"]} */
  const flags = {
    json: false,
    help: false,
    version: false,
    receipt_stdin: false,
    root: null,
    task: null
  };
  /** @type {string[]} */
  const positionals = [];
  /** @type {string | null} */
  let command = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) {
      throw new Error("Kanon arguments were unavailable or invalid.");
    }
    if (argument === "--json") {
      flags.json = true;
    } else if (argument === "--help" || argument === "-h") {
      flags.help = true;
    } else if (argument === "--version" || argument === "-v") {
      flags.version = true;
    } else if (argument === "--receipt-stdin") {
      flags.receipt_stdin = true;
    } else if (argument === "--root" || argument === "--task") {
      const value = argv[index + 1];
      if (!isBoundedString(value, argument === "--root" ? 8_192 : 2_048)) {
        throw new Error(`${argument} requires a bounded value.`);
      }
      index += 1;
      if (argument === "--root") {
        flags.root = value;
      } else {
        flags.task = value;
      }
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${sanitizeDisplayText(argument, 128)}`);
    } else if (command === null) {
      command = argument;
    } else {
      positionals.push(argument);
    }
  }
  return { command, positionals, flags };
}

/**
 * @param {ParsedArguments} parsed
 * @returns {{
 *   skill: "orient" | "resume" | "verify" | "status",
 *   task?: string,
 *   target?: string
 * }}
 */
function routeCommand(parsed) {
  const command = parsed.command;
  if (command === "orient" || command === "brief") {
    return {
      skill: "orient",
      task:
        parsed.flags.task ||
        sanitizeDisplayText(
          parsed.positionals.join(" "),
          2_048
        ) ||
        "bounded repository orientation"
    };
  }
  if (command === "resume") {
    if (parsed.positionals.length > 0) {
      throw new Error("resume accepts task context only through --task.");
    }
    return {
      skill: "resume",
      task:
        parsed.flags.task ||
        "resume from live repository evidence"
    };
  }
  if (command === "verify") {
    if (parsed.positionals.length > 1) {
      throw new Error("verify accepts at most one documentation target.");
    }
    const target = parsed.positionals[0] || "README.md";
    return {
      skill: "verify",
      target,
      task: parsed.flags.task || `verify ${target}`
    };
  }
  if (command === "status") {
    if (
      parsed.positionals.length > 0 ||
      parsed.flags.task !== null
    ) {
      throw new Error("status accepts no positional or task input.");
    }
    return { skill: "status" };
  }
  if (command === "ask") {
    const question = sanitizeDisplayText(
      parsed.positionals.join(" "),
      2_048
    );
    if (!question) {
      throw new Error('Usage: kanon ask "narrow repository question"');
    }
    return routeAsk(question);
  }
  throw new Error(
    `Unknown command: ${sanitizeDisplayText(command, 128)}`
  );
}

/**
 * @param {string} question
 * @returns {{
 *   skill: "orient" | "verify",
 *   task: string,
 *   target?: string
 * }}
 */
function routeAsk(question) {
  const lower = question.toLowerCase();
  const families = [
    /(?:what does|purpose|what is this repo)/.test(lower) ? "purpose" : "",
    /(?:how .*run|run command|start command)/.test(lower) ? "run" : "",
    /(?:how .*test|test command)/.test(lower) ? "test" : "",
    /(?:git state|working tree|branch|head)/.test(lower) ? "git" : "",
    /(?:literal|search .* for|find .* in)/.test(lower) ? "literal" : "",
    /(?:readme|documentation|drift|stale|verify)/.test(lower)
      ? "documentation"
      : ""
  ].filter(Boolean);
  const unique = new Set(families);
  if (unique.size !== 1) {
    throw new Error(
      "ask supports one narrow purpose, run, test, Git, documentation-drift, or literal-search question at a time."
    );
  }
  if (unique.has("documentation")) {
    return {
      skill: "verify",
      task: question,
      target: "README.md"
    };
  }
  return {
    skill: "orient",
    task: question
  };
}

/**
 * @param {NodeJS.ReadableStream} stream
 * @returns {Promise<unknown>}
 */
async function readReceipt(stream) {
  /** @type {Buffer[]} */
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const selected = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(String(chunk));
    bytes += selected.length;
    if (bytes > MAX_RECEIPT_INPUT_BYTES) {
      throw new Error("Receipt input exceeded the 16 KiB limit.");
    }
    chunks.push(selected);
  }
  if (bytes === 0) {
    throw new Error("Receipt input was empty.");
  }
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch {
    throw new Error("Receipt input was malformed.");
  }
}

/**
 * @param {NodeJS.ProcessEnv} environment
 * @returns {"codex-cli" | "claude-code" | "Unknown"}
 */
function selectHost(environment) {
  const codex = isBoundedString(environment.PLUGIN_ROOT, 8_192);
  const claude = isBoundedString(
    environment.CLAUDE_PLUGIN_ROOT,
    8_192
  );
  if (codex === claude) {
    return "Unknown";
  }
  return codex ? "codex-cli" : "claude-code";
}

/**
 * @param {import("./skills/invoke.js").StableSkillResult} result
 * @returns {string}
 */
function renderStableResult(result) {
  const lines = [];
  if (
    result.deprecation.ok &&
    result.deprecation.status === "Deprecated"
  ) {
    lines.push(result.deprecation.warning, "");
  }
  lines.push(
    `# Kanon ${result.skill}`,
    "",
    `Status: ${result.status}`,
    `Host: ${result.host.name}`,
    "Mode: notice",
    "Enforcement: false",
    "Hook status: Unknown",
    "",
    "Trust boundary: repository-derived values below are untrusted data.",
    "Kanon did not execute repository-controlled code.",
    ""
  );
  const json = JSON.stringify(result.report, null, 2);
  const marker = crypto
    .createHash("sha256")
    .update(json, "utf8")
    .digest("hex")
    .slice(0, 16);
  const longest = Math.max(
    3,
    ...Array.from(json.matchAll(/`+/g), (match) => match[0].length + 1)
  );
  const fence = "`".repeat(longest);
  lines.push(
    `BEGIN REPOSITORY DATA (untrusted; ${marker})`,
    `${fence}json`,
    json,
    fence,
    `END REPOSITORY DATA (untrusted; ${marker})`,
    ""
  );
  return `${lines.join("\n")}\n`;
}

/**
 * @returns {string}
 */
function helpText() {
  return `Kanon v1 stable read skills

Usage:
  kanon orient [TASK] [--json] [--root PATH]
  kanon resume [--task TEXT] [--json] [--root PATH]
  kanon verify [README.md] [--task TEXT] [--receipt-stdin] [--json] [--root PATH]
  kanon status [--receipt-stdin] [--json] [--root PATH]

Compatibility read aliases:
  brief -> orient
  narrow ask -> orient or verify
  resume -> resume
  verify -> verify

Refresh and todo remain explicit v0.4 continuity writes. Notice mode is
advisory, enforcement is false, and unavailable host state remains Unknown.
`;
}
