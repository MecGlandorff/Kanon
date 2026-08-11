import fs from "node:fs";
import path from "node:path";
import { analyzeRepo } from "../analyze.js";
import { answerRepoQuestion } from "../ask.js";
import {
  buildContinuityArtifactMetadata,
  buildContinuityReport
} from "../continuity/engine.js";
import {
  inspectKanonTodos,
  inspectPreviousHandoff,
  inspectPreviousState
} from "../persist.js";
import { renderAsk } from "../render/ask.js";
import { renderBrief } from "../render/brief.js";
import {
  renderResume,
  renderVerify
} from "../render/continuity.js";
import { safeJsonStringify } from "../trust.js";
import { VERSION } from "../version.js";
import { helpText, parseArgs } from "./args.js";
import { normalizeIo, writeStdout } from "./io.js";
import { runWriteCommand } from "../v1/compatibility/cli.js";

/**
 * @param {string[]} [argv]
 * @param {import("./io.js").IoOptions} [ioOptions]
 * @returns {Promise<void>}
 */
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
        writeStdout(io, `${safeJsonStringify(analysis.state)}\n`);
      } else {
        writeStdout(io, renderBrief(analysis, { deep: parsed.flags.deep }));
      }
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
          `${safeJsonStringify(analysis.state.verification)}\n`
        );
      } else {
        writeStdout(io, renderVerify(analysis));
      }
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
          `${safeJsonStringify({
            question,
            answer,
            state: analysis.state
          })}\n`
        );
      } else {
        writeStdout(io, renderAsk(analysis, question, { answer }));
      }
      return;
    }

    case "resume": {
      const previous = inspectPreviousState(root);
      const handoff = inspectPreviousHandoff(root);
      const todos = inspectKanonTodos(root);
      const analysis = analyzeRepo(root);
      const continuity = buildContinuityReport({
        artifact_metadata:
          buildContinuityArtifactMetadata(analysis.inspection),
        current: analysis.state,
        previous: previous.state,
        previous_warning: previous.warning || undefined,
        handoff: handoff.handoff
      });
      if (parsed.flags.json) {
        writeStdout(
          io,
          `${safeJsonStringify({
            previous: previous.state,
            previous_warning: previous.warning,
            handoff: handoff.handoff,
            handoff_warning: handoff.warning,
            current: analysis.state,
            continuity,
            todos: todos.todos,
            todo_warning: todos.warning
          })}\n`
        );
      } else {
        writeStdout(
          io,
          renderResume(analysis, previous.state, {
            todos: todos.todos,
            stateWarning: previous.warning,
            todoWarning: todos.warning,
            handoff: handoff.handoff,
            handoffWarning: handoff.warning,
            continuity
          })
        );
      }
      return;
    }

    case "todo":
    case "refresh":
      await runWriteCommand(root, parsed, io);
      return;

    default:
      throw new Error(`Unknown command: ${parsed.command}\n\n${helpText()}`);
  }
}
