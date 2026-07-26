import fs from "node:fs";
import path from "node:path";
import { analyzeRepo } from "../analyze.js";
import { answerRepoQuestion } from "../ask.js";
import { buildImprovements } from "../improve.js";
import {
  buildRefactorPlan,
  normalizeRefactorAgent,
  normalizeRefactorMode
} from "../refactor.js";
import {
  readKanonTodos,
  readPreviousState,
  writeKanonImproveOutput,
  writeKanonRefactorOutput,
  writeKanonOutputs
} from "../persist.js";
import {
  renderAsk,
  renderBrief,
  renderImprove,
  renderRefactor,
  renderResume,
  renderVerify
} from "../render.js";
import { VERSION } from "../version.js";
import { helpText, parseArgs } from "./args.js";
import {
  normalizeIo,
  resolveImproveMode,
  resolveRefactorAnswers,
  writeStdout
} from "./io.js";
import { runTodoCommand } from "./todo.js";

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
        writeStdout(
          io,
          `${JSON.stringify(analysis.state.verification, null, 2)}\n`
        );
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
        writeStdout(
          io,
          `${JSON.stringify(
            { question, answer, state: analysis.state },
            null,
            2
          )}\n`
        );
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
        writeStdout(
          io,
          `${JSON.stringify(
            { previous, current: analysis.state, todos },
            null,
            2
          )}\n`
        );
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
        writeStdout(
          io,
          `${JSON.stringify(
            { mode, improvements, state: analysis.state },
            null,
            2
          )}\n`
        );
      } else {
        writeStdout(io, renderImprove(improvements, { mode }));
      }
      if (parsed.flags.write) {
        const result = writeKanonImproveOutput(
          analysis,
          improvements,
          { mode }
        );
        writeStdout(
          io,
          `\nWrote Kanon improvements to ${result.kanonDir}\n`
        );
        for (const file of result.written) {
          writeStdout(io, `- ${file}\n`);
        }
      }
      return;
    }

    case "refactor": {
      const mode = normalizeRefactorMode(parsed.flags.mode || "plan");
      const agent = normalizeRefactorAgent(
        parsed.flags.agent || "generic"
      );
      const answers = await resolveRefactorAnswers(parsed.flags, io);
      const analysis = analyzeRepo(root);
      const refactor = buildRefactorPlan(analysis, { answers, agent });
      analysis.state.refactor = refactor;
      if (parsed.flags.json) {
        writeStdout(
          io,
          `${JSON.stringify(
            { mode, agent, refactor, state: analysis.state },
            null,
            2
          )}\n`
        );
      } else {
        writeStdout(io, renderRefactor(refactor, { mode }));
      }
      if (parsed.flags.write) {
        const result = writeKanonRefactorOutput(
          analysis,
          refactor,
          { mode }
        );
        writeStdout(
          io,
          `\nWrote Kanon refactor plan to ${result.kanonDir}\n`
        );
        for (const file of result.written) {
          writeStdout(io, `- ${file}\n`);
        }
      }
      return;
    }

    case "todo":
      await runTodoCommand(root, parsed, io);
      return;

    case "refresh": {
      const analysis = analyzeRepo(root);
      const result = writeKanonOutputs(analysis, {
        deep: parsed.flags.deep
      });
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
