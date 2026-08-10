#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditComparativePacketAgainstInputs,
  buildComparativePacket,
  comparativeReviewerCommand,
  validateComparativePacket,
  validateCompletedComparativePacket
} from "./lib/d2c-comparative.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const options = parseArgs(process.argv.slice(2));

if (options.mode === "validate") {
  process.stdout.write(
    `${JSON.stringify(validateComparativePacket(options.packet), null, 2)}\n`
  );
} else if (options.mode === "audit-inputs") {
  process.stdout.write(
    `${JSON.stringify(auditComparativePacketAgainstInputs({
      repoRoot,
      packetRoot: options.packet
    }), null, 2)}\n`
  );
} else if (options.mode === "validate-result") {
  process.stdout.write(
    `${JSON.stringify(
      validateCompletedComparativePacket(options.packet),
      null,
      2
    )}\n`
  );
} else if (options.mode === "reviewer-command") {
  process.stdout.write(`${comparativeReviewerCommand(options.packet)}\n`);
} else {
  process.stdout.write(
    `${JSON.stringify(buildComparativePacket({
      repoRoot,
      outputRoot: options.output,
      sourcePacketRoot: options.sourcePacket
    }), null, 2)}\n`
  );
}

function parseArgs(args) {
  const output = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if ([
      "--validate",
      "--audit-inputs",
      "--validate-result",
      "--reviewer-command"
    ].includes(flag)) {
      if (output.mode) {
        throw new Error("Select exactly one comparative operation.");
      }
      const packet = args[index + 1];
      if (!packet || packet.startsWith("--")) {
        throw new Error(`${flag} requires a packet path.`);
      }
      output.mode = flag.slice(2);
      output.packet = packet;
      index += 1;
      continue;
    }
    if (!["--output", "--source-packet"].includes(flag)) {
      throw new Error(
        "Usage: build-d2c-comparative.js --output <path> --source-packet <path> | --validate|--audit-inputs|--validate-result|--reviewer-command <packet>"
      );
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a path.`);
    }
    output[flag.slice(2).replace(
      /-([a-z])/g,
      (_match, char) => char.toUpperCase()
    )] = value;
    index += 1;
  }
  if (output.mode) {
    if (output.output || output.sourcePacket) {
      throw new Error(
        "Comparative validation modes cannot be combined with build options."
      );
    }
    return output;
  }
  if (!output.output || !output.sourcePacket) {
    throw new Error("--output and --source-packet are required.");
  }
  output.mode = "build";
  return output;
}
