import path from "node:path";
import { findByPath } from "../scanner.js";
import { isNegatedAt } from "./language.js";

/**
 * @typedef {import("./index.js").VerificationContext} VerificationContext
 * @typedef {import("./index.js").VerificationObservation}
 *   VerificationObservation
 * @typedef {VerificationContext & {
 *   readmeFile: import("../scanner/read.js").ScannedFile
 * }} CommandVerificationContext
 */

/**
 * @param {string} markdown
 * @returns {string[]}
 */
export function extractCommandsFromMarkdown(markdown) {
  /** @type {Set<string>} */
  const commands = new Set();
  const promptPattern = /^\s*\$\s+(.+)$/gm;
  const inlinePattern = /`(((?:(?:npm|npx|pnpm|yarn|pytest|python3?|node|docker)\b)|kanon(?=\s|$))[^`\n]*)`/gi;
  let match;

  while ((match = promptPattern.exec(markdown))) {
    if (match[1]) {
      addCommand(commands, match[1]);
    }
  }

  while ((match = inlinePattern.exec(markdown))) {
    if (!isNegatedAt(markdown, match.index, match[0].length)) {
      if (match[1]) {
        addCommand(commands, match[1]);
      }
    }
  }

  for (const command of extractFencedCodeCommands(markdown)) {
    addCommand(commands, command);
  }

  return Array.from(commands);
}

/**
 * @param {string} command
 * @param {CommandVerificationContext} context
 * @returns {VerificationObservation | null}
 */
export function verifyCommand(command, context) {
  const packageScripts = context.packageInfo?.scripts || {};
  const available = Object.keys(packageScripts);
  const readmeEvidence = context.evidence.add(
    "file",
    context.readmeFile.path,
    `README documents command \`${command}\`.`,
    command
  );

  const scriptCheck = npmScriptExpectation(command);
  if (scriptCheck && context.packageInfo?.json) {
    if (!packageScripts[scriptCheck.script]) {
      return {
        type: "command_drift",
        severity: "warning",
        conclusion: "contradiction",
        claim: `README says to run \`${command}\`.`,
        observation: `package.json has no \`${scriptCheck.script}\` script; available scripts: ${available.length ? available.join(", ") : "(none)"}.`,
        evidence: [
          readmeEvidence,
          context.packageInfo.evidence
        ].filter(Boolean),
        suggestion:
          "Resolve this direct declaration contradiction before relying on the documented command."
      };
    }
    return null;
  }

  const nodeTarget = command.match(/^node\s+([^\s]+)/);
  if (nodeTarget?.[1]) {
    const rel = normalizeCommandPath(nodeTarget[1]);
    if (!findByPath(context.files, rel)) {
      return {
        type: "command_drift",
        severity: "info",
        conclusion: "unknown",
        claim: `README says to run \`${command}\`.`,
        observation:
          `The current bounded checks did not observe ${rel}. ` +
          "This non-observation is not a direct contradiction." +
          `${context.scan.complete ? "" : " The scan was incomplete."}`,
        evidence: [readmeEvidence],
        suggestion: "Update the documented node command or add the referenced file."
      };
    }
  }

  const pythonTarget = command.match(/^python(?:3)?\s+([^\s-][^\s]*)/);
  if (pythonTarget?.[1] && /\.py$/.test(pythonTarget[1])) {
    const rel = normalizeCommandPath(pythonTarget[1]);
    if (!findByPath(context.files, rel)) {
      return {
        type: "command_drift",
        severity: "info",
        conclusion: "unknown",
        claim: `README says to run \`${command}\`.`,
        observation:
          `The current bounded checks did not observe ${rel}. ` +
          "This non-observation is not a direct contradiction." +
          `${context.scan.complete ? "" : " The scan was incomplete."}`,
        evidence: [readmeEvidence],
        suggestion: "Update the documented Python command or add the referenced file."
      };
    }
  }

  return null;
}

/**
 * @param {string} markdown
 * @returns {string[]}
 */
function extractFencedCodeCommands(markdown) {
  /** @type {string[]} */
  const commands = [];
  const fencePattern = /```[A-Za-z0-9_-]*\n([\s\S]*?)```/g;
  const commandLinePattern = /^\s*(((?:(?:npm|npx|pnpm|yarn|pytest|python3?|node|docker)\b)|kanon(?=\s|$))[^\n]*)$/i;
  let match;

  while ((match = fencePattern.exec(markdown))) {
    for (const line of (match[1] ?? "").split(/\r?\n/)) {
      const command = line.match(commandLinePattern);
      if (command?.[1]) {
        commands.push(command[1]);
      }
    }
  }

  return commands;
}

/**
 * @param {Set<string>} commands
 * @param {string} raw
 * @returns {void}
 */
function addCommand(commands, raw) {
  const command = raw
    .replace(/\s+#.*$/, "")
    .replace(/\s+&&.*$/, "")
    .trim();

  if (!command || command.startsWith("git clone") || command.startsWith("cd ")) {
    return;
  }

  commands.add(command);
}

/**
 * @param {string} command
 * @returns {{manager: "npm" | "pnpm" | "yarn", script: string} | null}
 */
function npmScriptExpectation(command) {
  const normalized = command.trim();
  const match = normalized.match(/^(npm|pnpm)\s+(start|test|build|dev)$/);
  if (
    match?.[1] &&
    match[2] &&
    (match[1] === "npm" || match[1] === "pnpm")
  ) {
    return { manager: match[1], script: match[2] };
  }

  const run = normalized.match(/^(npm|pnpm)\s+run\s+([A-Za-z0-9:_-]+)/);
  if (
    run?.[1] &&
    run[2] &&
    (run[1] === "npm" || run[1] === "pnpm")
  ) {
    return { manager: run[1], script: run[2] };
  }

  const yarn = normalized.match(/^yarn\s+([A-Za-z0-9:_-]+)/);
  if (yarn?.[1] && yarn[1] !== "install" && yarn[1] !== "add") {
    return { manager: "yarn", script: yarn[1] };
  }

  return null;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeCommandPath(value) {
  return path.normalize(value.replace(/^\.\//, "")).replaceAll("\\", "/");
}
