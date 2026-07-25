import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { analyzeRepo } from "./analyze.js";
import { answerRepoQuestion } from "./ask.js";
import { buildImprovements, normalizeImproveMode } from "./improve.js";
import {
  buildRefactorPlan,
  normalizeRefactorAgent,
  normalizeRefactorMode,
  REFACTOR_QUESTIONS
} from "./refactor.js";
import {
  addKanonTodo,
  completeKanonTodo,
  readKanonTodos,
  readPreviousState,
  writeKanonImproveOutput,
  writeKanonRefactorOutput,
  writeKanonOutputs
} from "./persist.js";
import {
  renderAsk,
  renderBrief,
  renderImprove,
  renderRefactor,
  renderResume,
  renderTodoList,
  renderVerify
} from "./render.js";
import { VERSION } from "./version.js";

export async function runCli(argv = [], ioOptions = {}) {
  const io = normalizeIo(ioOptions);
  const parsed = parseArgs(argv);

  if (parsed.flags.version) {
    writeStdout(io, `${VERSION}\n`);
    return;
  }

  if (parsed.flags.help || !parsed.command) {
    writeStdout(io, helpText());
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
        writeStdout(io, `${JSON.stringify(analysis.state, null, 2)}\n`);
      } else {
        writeStdout(io, renderBrief(analysis, { deep: parsed.flags.deep }));
      }
      maybeWrite(analysis, parsed.flags, io);
      return;
    }

    case "verify": {
      const target = parsed.positionals[0] || "README.md";
      if (!/^readme/i.test(path.basename(target))) {
        throw new Error("verify supports README files only.");
      }
      const analysis = analyzeRepo(root, { readmePath: target });
      if (parsed.flags.json) {
        writeStdout(io, `${JSON.stringify(analysis.state.verification, null, 2)}\n`);
      } else {
        writeStdout(io, renderVerify(analysis));
      }
      maybeWrite(analysis, parsed.flags, io);
      return;
    }

    case "ask": {
      const question = parsed.positionals.join(" ").trim();
      if (!question) {
        throw new Error('Usage: kanon ask "what does this repo do?"');
      }
      const analysis = analyzeRepo(root);
      const answer = answerRepoQuestion(analysis, question);
      if (parsed.flags.json) {
        writeStdout(io, `${JSON.stringify({ question, answer, state: analysis.state }, null, 2)}\n`);
      } else {
        writeStdout(io, renderAsk(analysis, question, { answer }));
      }
      maybeWrite(analysis, parsed.flags, io);
      return;
    }

    case "resume": {
      const previous = readPreviousState(root);
      const todos = readKanonTodos(root);
      const analysis = analyzeRepo(root);
      if (parsed.flags.json) {
        writeStdout(io, `${JSON.stringify({ previous, current: analysis.state, todos }, null, 2)}\n`);
      } else {
        writeStdout(io, renderResume(analysis, previous, { todos }));
      }
      maybeWrite(analysis, parsed.flags, io);
      return;
    }

    case "improve": {
      const mode = await resolveImproveMode(parsed.flags, io);
      const analysis = analyzeRepo(root);
      const improvements = buildImprovements(analysis);
      analysis.state.improvements = improvements;
      if (parsed.flags.json) {
        writeStdout(io, `${JSON.stringify({ mode, improvements, state: analysis.state }, null, 2)}\n`);
      } else {
        writeStdout(io, renderImprove(improvements, { mode }));
      }
      if (parsed.flags.write) {
        const result = writeKanonImproveOutput(analysis, improvements, { mode });
        writeStdout(io, `\nWrote Kanon improvements to ${result.kanonDir}\n`);
        for (const file of result.written) {
          writeStdout(io, `- ${file}\n`);
        }
      }
      return;
    }

    case "refactor": {
      const mode = normalizeRefactorMode(parsed.flags.mode || "plan");
      const agent = normalizeRefactorAgent(parsed.flags.agent || "generic");
      const answers = await resolveRefactorAnswers(parsed.flags, io);
      const analysis = analyzeRepo(root);
      const refactor = buildRefactorPlan(analysis, { answers, agent });
      analysis.state.refactor = refactor;
      if (parsed.flags.json) {
        writeStdout(io, `${JSON.stringify({ mode, agent, refactor, state: analysis.state }, null, 2)}\n`);
      } else {
        writeStdout(io, renderRefactor(refactor, { mode }));
      }
      if (parsed.flags.write) {
        const result = writeKanonRefactorOutput(analysis, refactor, { mode });
        writeStdout(io, `\nWrote Kanon refactor plan to ${result.kanonDir}\n`);
        for (const file of result.written) {
          writeStdout(io, `- ${file}\n`);
        }
      }
      return;
    }

    case "todo": {
      await runTodoCommand(root, parsed, io);
      return;
    }

    case "refresh": {
      const analysis = analyzeRepo(root);
      const result = writeKanonOutputs(analysis, { deep: parsed.flags.deep });
      writeStdout(io, `Kanon refreshed ${result.kanonDir}\n`);
      for (const file of result.written) {
        writeStdout(io, `- ${file}\n`);
      }
      return;
    }

    default:
      throw new Error(`Unknown command: ${parsed.command}\n\n${helpText()}`);
  }
}

function maybeWrite(analysis, flags, io) {
  if (!flags.write) {
    return;
  }

  const result = writeKanonOutputs(analysis, { deep: flags.deep });
  writeStdout(io, `\nWrote Kanon files to ${result.kanonDir}\n`);
}

async function runTodoCommand(root, parsed, io) {
  const action = parsed.positionals[0] || "list";

  if (action === "list") {
    const todos = readKanonTodos(root);
    if (parsed.flags.json) {
      writeStdout(io, `${JSON.stringify({ todos }, null, 2)}\n`);
    } else {
      writeStdout(io, renderTodoList(todos, { all: parsed.flags.all }));
    }
    return;
  }

  if (action === "add") {
    const text = parsed.flags.stdin
      ? await readStdin(io)
      : parsed.positionals.slice(1).join(" ");
    const result = addKanonTodo(root, text);
    if (parsed.flags.json) {
      writeStdout(io, `${JSON.stringify(result, null, 2)}\n`);
    } else {
      writeStdout(io, `Added Kanon todo #${result.todo.number}: ${result.todo.text}\n`);
    }
    return;
  }

  if (action === "done") {
    const result = completeKanonTodo(root, parsed.positionals[1]);
    if (parsed.flags.json) {
      writeStdout(io, `${JSON.stringify(result, null, 2)}\n`);
    } else if (result.changed) {
      writeStdout(io, `Completed Kanon todo #${result.todo.number}: ${result.todo.text}\n`);
    } else {
      writeStdout(io, `Kanon todo #${result.todo.number} was already complete: ${result.todo.text}\n`);
    }
    return;
  }

  throw new Error(`Unknown todo command: ${action}\n\n${todoHelpText()}`);
}

async function readStdin(io) {
  if (io.stdin.isTTY) {
    throw new Error("kanon todo add --stdin expects piped input.");
  }

  let text = "";
  io.stdin.setEncoding("utf8");
  for await (const chunk of io.stdin) {
    text += chunk;
  }
  return text;
}

async function resolveImproveMode(flags, io) {
  if (flags.mode) {
    return normalizeImproveMode(flags.mode);
  }

  if (!flags.json && io.stdin.isTTY && io.stdout.isTTY) {
    const rl = readline.createInterface({ input: io.stdin, output: io.stdout });
    try {
      const answer = await rl.question("Choose improvement report: 1) Top 5  2) Full audit  3) Scorecard [1]: ");
      return normalizeImproveMode(answer.trim() || "1");
    } finally {
      rl.close();
    }
  }

  return "top";
}

async function resolveRefactorAnswers(flags, io) {
  if (flags.json || !io.stdin.isTTY || !io.stdout.isTTY) {
    return {};
  }

  const answers = {};
  const rl = readline.createInterface({ input: io.stdin, output: io.stdout });
  try {
    for (const question of REFACTOR_QUESTIONS) {
      const answer = await rl.question(`${question.prompt} [${question.default}]: `);
      if (answer.trim()) {
        answers[question.id] = answer.trim();
      }
    }
  } finally {
    rl.close();
  }
  return answers;
}

function parseArgs(argv) {
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

function normalizeIo(options) {
  return {
    stdin: options.stdin || process.stdin,
    stdout: options.stdout || process.stdout
  };
}

function writeStdout(io, text) {
  io.stdout.write(text);
}

function todoHelpText() {
  return `Kanon todo commands:
  kanon todo list [--all] [--json] [--root PATH]
  kanon todo add "describe the work" [--json] [--root PATH]
  kanon todo add --stdin [--json] [--root PATH]
  kanon todo done <number> [--json] [--root PATH]
`;
}

function helpText() {
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
