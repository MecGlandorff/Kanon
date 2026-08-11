import fs from "node:fs";
import path from "node:path";
import { safeTerminalText } from "../../trust.js";
import { VERSION } from "../../version.js";

/**
 * @typedef {{
 *   json: boolean,
 *   deep: boolean,
 *   help: boolean,
 *   version: boolean,
 *   stdin: boolean,
 *   all: boolean,
 *   root: string | null
 * }} WriteFlags
 * @typedef {{
 *   command: string | null,
 *   flags: WriteFlags,
 *   positionals: string[]
 * }} ParsedWriteArgs
 * @typedef {{
 *   stdin?: import("node:stream").Readable & {isTTY?: boolean},
 *   stdout?: NodeJS.WritableStream
 * }} WriteIoOptions
 * @typedef {{
 *   stdin: import("node:stream").Readable & {isTTY?: boolean},
 *   stdout: NodeJS.WritableStream
 * }} WriteIo
 */

const HELP_TEXT = `Kanon - repo continuity for AI coding agents

Usage:
  kanon brief [--deep] [--json] [--root PATH]
  kanon verify [README.md] [--json] [--root PATH]
  kanon ask "question" [--json] [--root PATH]
  kanon resume [--json] [--root PATH]
  kanon todo [list|add|done] [--json] [--root PATH]
  kanon refresh [--deep] [--root PATH]

Commands:
  brief    Evidence-backed repo orientation
  verify   README / repo drift report
  ask      Answer repo questions with evidence
  resume   Continue from the last .kanon checkpoint
  todo     Track human-owned follow-up work in .kanon/TODO.md
  refresh  Write .kanon continuity files

Read workflows are read-only. Only refresh and todo write .kanon/.
`;

/**
 * Run only the two approved compatibility write workflows.
 *
 * @param {string[]} [argv]
 * @param {WriteIoOptions} [ioOptions]
 * @returns {Promise<void>}
 */
export async function runWriteCli(argv = [], ioOptions = {}) {
  const io = {
    stdin: ioOptions.stdin || process.stdin,
    stdout: ioOptions.stdout || process.stdout
  };
  const parsed = parseWriteArgs(argv);
  if (parsed.flags.version) {
    io.stdout.write(`${VERSION}\n`);
    return;
  }
  if (parsed.flags.help || !parsed.command) {
    io.stdout.write(HELP_TEXT);
    return;
  }
  const root = path.resolve(parsed.flags.root || process.cwd());
  if (!fs.existsSync(root)) {
    throw new Error(`Repo root does not exist: ${root}`);
  }
  if (parsed.command !== "refresh" && parsed.command !== "todo") {
    throw new Error(`Unknown command: ${parsed.command}\n\n${HELP_TEXT}`);
  }
  await runWriteCommand(root, parsed, io);
}

/**
 * @param {string} root
 * @param {ParsedWriteArgs} parsed
 * @param {WriteIo} io
 */
export async function runWriteCommand(root, parsed, io) {
  if (parsed.command === "todo") {
    const { runTodoCommand } = await import("./todo.js");
    await runTodoCommand(root, parsed, io);
    return;
  }
  if (parsed.command !== "refresh") {
    throw new Error("Compatibility write command was unavailable.");
  }
  const { refreshKanon } = await import("./refresh.js");
  const result = refreshKanon(root, { deep: parsed.flags.deep });
  io.stdout.write(`Kanon refreshed ${safeTerminalText(result.kanonDir)}\n`);
  for (const file of result.written) {
    io.stdout.write(`- ${file}\n`);
  }
  for (const warning of result.warnings || []) {
    io.stdout.write(`Warning: ${safeTerminalText(warning)}\n`);
  }
}

/** @param {string[]} argv @returns {ParsedWriteArgs} */
function parseWriteArgs(argv) {
  /** @type {WriteFlags} */
  const flags = {
    json: false,
    deep: false,
    help: false,
    version: false,
    stdin: false,
    all: false,
    root: null
  };
  /** @type {string[]} */
  const positionals = [];
  /** @type {string | null} */
  let command = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      throw new Error("CLI argument input was incomplete.");
    }
    if (arg === "--root") {
      const root = argv[index += 1];
      if (!root) {
        throw new Error("--root requires a path");
      }
      flags.root = root;
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--deep") {
      flags.deep = true;
    } else if (arg === "--stdin") {
      flags.stdin = true;
    } else if (arg === "--all") {
      flags.all = true;
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      flags.version = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (command === null) {
      command = arg;
    } else {
      positionals.push(arg);
    }
  }
  return { command, flags, positionals };
}
