/**
 * @typedef {{
 *   json: boolean,
 *   deep: boolean,
 *   help: boolean,
 *   version: boolean,
 *   stdin: boolean,
 *   all: boolean,
 *   root: string | null
 * }} CliFlags
 * @typedef {{
 *   command: string | null,
 *   flags: CliFlags,
 *   positionals: string[]
 * }} ParsedArgs
 */

/**
 * @param {string[]} argv
 * @returns {ParsedArgs}
 */
export function parseArgs(argv) {
  /** @type {CliFlags} */
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

    if (arg === "--json") {
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
    } else if (arg === "--root") {
      index += 1;
      const root = argv[index];
      if (!root) {
        throw new Error("--root requires a path");
      }
      flags.root = root;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!command) {
      command = arg;
    } else {
      positionals.push(arg);
    }
  }

  return { command, flags, positionals };
}

/** @returns {string} */
export function todoHelpText() {
  return `Kanon todo commands:
  kanon todo list [--all] [--json] [--root PATH]
  kanon todo add "describe the work" [--json] [--root PATH]
  kanon todo add --stdin [--json] [--root PATH]
  kanon todo done <number> [--json] [--root PATH]
`;
}

/** @returns {string} */
export function helpText() {
  return `Kanon - repo continuity for AI coding agents

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
}
