import fs from "node:fs";
import path from "node:path";
import { analyzeRepo } from "./analyze.js";
import { readPreviousState, writeKanonOutputs } from "./persist.js";
import { renderAsk, renderBrief, renderResume, renderVerify } from "./render.js";

const VERSION = "0.1.0";

export async function runCli(argv = []) {
  const parsed = parseArgs(argv);

  if (parsed.flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  if (parsed.flags.help || !parsed.command) {
    process.stdout.write(helpText());
    return;
  }

  const root = path.resolve(parsed.flags.root || process.cwd());
  if (!fs.existsSync(root)) {
    throw new Error(`Repo root does not exist: ${root}`);
  }

  switch (parsed.command) {
    case "brief": {
      const analysis = analyzeRepo(root);
      if (parsed.flags.json) {
        process.stdout.write(`${JSON.stringify(analysis.state, null, 2)}\n`);
      } else {
        process.stdout.write(renderBrief(analysis, { deep: parsed.flags.deep }));
      }
      maybeWrite(analysis, parsed.flags);
      return;
    }

    case "verify": {
      const target = parsed.positionals[0] || "README.md";
      if (!/^readme/i.test(path.basename(target))) {
        throw new Error("v0.1 verify supports README files only.");
      }
      const analysis = analyzeRepo(root);
      if (parsed.flags.json) {
        process.stdout.write(`${JSON.stringify(analysis.state.verification, null, 2)}\n`);
      } else {
        process.stdout.write(renderVerify(analysis));
      }
      maybeWrite(analysis, parsed.flags);
      return;
    }

    case "ask": {
      const question = parsed.positionals.join(" ").trim();
      if (!question) {
        throw new Error('Usage: kanon ask "what does this repo do?"');
      }
      const analysis = analyzeRepo(root);
      if (parsed.flags.json) {
        process.stdout.write(`${JSON.stringify({ question, state: analysis.state }, null, 2)}\n`);
      } else {
        process.stdout.write(renderAsk(analysis, question));
      }
      maybeWrite(analysis, parsed.flags);
      return;
    }

    case "resume": {
      const previous = readPreviousState(root);
      const analysis = analyzeRepo(root);
      if (parsed.flags.json) {
        process.stdout.write(`${JSON.stringify({ previous, current: analysis.state }, null, 2)}\n`);
      } else {
        process.stdout.write(renderResume(analysis, previous));
      }
      maybeWrite(analysis, parsed.flags);
      return;
    }

    case "refresh": {
      const analysis = analyzeRepo(root);
      const result = writeKanonOutputs(analysis, { deep: parsed.flags.deep });
      process.stdout.write(`Kanon refreshed ${result.kanonDir}\n`);
      for (const file of result.written) {
        process.stdout.write(`- ${file}\n`);
      }
      return;
    }

    default:
      throw new Error(`Unknown command: ${parsed.command}\n\n${helpText()}`);
  }
}

function maybeWrite(analysis, flags) {
  if (!flags.write) {
    return;
  }

  const result = writeKanonOutputs(analysis, { deep: flags.deep });
  process.stdout.write(`\nWrote Kanon files to ${result.kanonDir}\n`);
}

function parseArgs(argv) {
  const flags = {
    write: false,
    json: false,
    deep: false,
    help: false,
    version: false,
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
    } else if (!command) {
      command = arg;
    } else {
      positionals.push(arg);
    }
  }

  return { command, flags, positionals };
}

function helpText() {
  return `Kanon - repo continuity for AI coding agents

Usage:
  kanon brief [--deep] [--json] [--write] [--root PATH]
  kanon verify [README.md] [--json] [--write] [--root PATH]
  kanon ask "question" [--json] [--write] [--root PATH]
  kanon resume [--json] [--write] [--root PATH]
  kanon refresh [--deep] [--root PATH]

Commands:
  brief    Evidence-backed repo orientation
  verify   README / repo drift report
  ask      Answer repo questions with evidence
  resume   Continue from the last .kanon checkpoint
  refresh  Write .kanon continuity files

Default behavior is read-only. Use refresh or --write to write .kanon/.
`;
}
