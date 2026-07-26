import readline from "node:readline/promises";
import { normalizeImproveMode } from "../improve.js";
import { REFACTOR_QUESTIONS } from "../refactor.js";

export function normalizeIo(options) {
  return {
    stdin: options.stdin || process.stdin,
    stdout: options.stdout || process.stdout
  };
}

export function writeStdout(io, text) {
  io.stdout.write(text);
}

export async function readStdin(io) {
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

export async function resolveImproveMode(flags, io) {
  if (flags.mode) {
    return normalizeImproveMode(flags.mode);
  }

  if (!flags.json && io.stdin.isTTY && io.stdout.isTTY) {
    const rl = readline.createInterface({
      input: io.stdin,
      output: io.stdout
    });
    try {
      const answer = await rl.question(
        "Choose improvement report: 1) Top 5  2) Full audit  3) Scorecard [1]: "
      );
      return normalizeImproveMode(answer.trim() || "1");
    } finally {
      rl.close();
    }
  }

  return "top";
}

export async function resolveRefactorAnswers(flags, io) {
  if (flags.json || !io.stdin.isTTY || !io.stdout.isTTY) {
    return {};
  }

  const answers = {};
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stdout
  });
  try {
    for (const question of REFACTOR_QUESTIONS) {
      const answer = await rl.question(
        `${question.prompt} [${question.default}]: `
      );
      if (answer.trim()) {
        answers[question.id] = answer.trim();
      }
    }
  } finally {
    rl.close();
  }
  return answers;
}
