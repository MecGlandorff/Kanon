import fs from "node:fs";
import path from "node:path";
import { analyzeRepo } from "../analyze.js";
import { writeKanonOutputs } from "../persist.js";
import { safeTerminalText } from "../trust.js";
import { VERSION } from "../version.js";
import { helpText, parseArgs } from "./args.js";
import { normalizeIo, writeStdout } from "./io.js";
import { runTodoCommand } from "./todo.js";

/**
 * Run only the two approved compatibility write workflows.
 *
 * @param {string[]} [argv]
 * @param {import("./io.js").IoOptions} [ioOptions]
 * @returns {Promise<void>}
 */
export async function runWriteCli(argv = [], ioOptions = {}) {
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
  if (parsed.command !== "refresh" && parsed.command !== "todo") {
    throw new Error(`Unknown command: ${parsed.command}\n\n${helpText()}`);
  }
  await runWriteCommand(root, parsed, io);
}

/**
 * Share the exact refresh and TODO implementations with the development CLI.
 *
 * @param {string} root
 * @param {import("./args.js").ParsedArgs} parsed
 * @param {import("./io.js").NormalizedIo} io
 * @returns {Promise<void>}
 */
export async function runWriteCommand(root, parsed, io) {
  if (parsed.command === "todo") {
    await runTodoCommand(root, parsed, io);
    return;
  }
  if (parsed.command !== "refresh") {
    throw new Error("Compatibility write command was unavailable.");
  }

  const analysis = analyzeRepo(root);
  const result = writeKanonOutputs(analysis, {
    deep: parsed.flags.deep
  });
  writeStdout(
    io,
    `Kanon refreshed ${safeTerminalText(result.kanonDir)}\n`
  );
  for (const file of result.written) {
    writeStdout(io, `- ${file}\n`);
  }
  for (const warning of result.warnings || []) {
    writeStdout(io, `Warning: ${safeTerminalText(warning)}\n`);
  }
}
