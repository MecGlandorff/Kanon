export function parseArgs(argv) {
  const flags = {
    write: false,
    json: false,
    deep: false,
    help: false,
    version: false,
    stdin: false,
    all: false,
    mode: null,
    agent: null,
    root: null
  };
  const positionals = [];
  let command = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--write") {
      flags.write = true;
    } else if (arg === "--no-write") {
      flags.write = false;
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--deep") {
      flags.deep = true;
    } else if (arg === "--stdin") {
      flags.stdin = true;
    } else if (arg === "--all") {
      flags.all = true;
    } else if (arg === "--mode") {
      index += 1;
      flags.mode = argv[index];
      if (!flags.mode) {
        throw new Error("--mode requires top, audit, or scorecard");
      }
    } else if (arg.startsWith("--mode=")) {
      flags.mode = arg.slice("--mode=".length);
    } else if (arg === "--agent") {
      index += 1;
      flags.agent = argv[index];
      if (!flags.agent) {
        throw new Error("--agent requires generic, codex, or claude");
      }
    } else if (arg.startsWith("--agent=")) {
      flags.agent = arg.slice("--agent=".length);
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      flags.version = true;
    } else if (arg === "--root") {
      index += 1;
      flags.root = argv[index];
      if (!flags.root) {
        throw new Error("--root requires a path");
      }
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

export function todoHelpText() {
  return `Kanon todo commands:
  kanon todo list [--all] [--json] [--root PATH]
  kanon todo add "describe the work" [--json] [--root PATH]
  kanon todo add --stdin [--json] [--root PATH]
  kanon todo done <number> [--json] [--root PATH]
`;
}

export function helpText() {
  return `Kanon - repo continuity for AI coding agents

Usage:
  kanon brief [--deep] [--json] [--write] [--root PATH]
  kanon verify [README.md] [--json] [--write] [--root PATH]
  kanon ask "question" [--json] [--write] [--root PATH]
  kanon resume [--json] [--write] [--root PATH]
  kanon improve [--mode top|audit|scorecard] [--json] [--write] [--root PATH]
  kanon refactor [--mode plan|audit|prompt] [--agent generic|codex|claude] [--json] [--write] [--root PATH]
  kanon todo [list|add|done] [--json] [--root PATH]
  kanon refresh [--deep] [--root PATH]

Commands:
  brief    Evidence-backed repo orientation
  verify   README / repo drift report
  ask      Answer repo questions with evidence
  resume   Continue from the last .kanon checkpoint
  improve  Recommend evidence-backed project improvements
  refactor Build a one-session code cleanup/refactor plan
  todo     Track human-owned follow-up work in .kanon/TODO.md
  refresh  Write .kanon continuity files

Default behavior is read-only. Use refresh, todo, or --write to write .kanon/.
`;
}
