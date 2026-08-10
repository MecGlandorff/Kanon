#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPacket,
  auditPacketAgainstInputs,
  validatePacket
} from "./lib/d2c-packet.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const options = parseArgs(process.argv.slice(2));

if (options.auditInputs) {
  process.stdout.write(
    `${JSON.stringify(auditPacketAgainstInputs({
      repoRoot,
      packetRoot: options.auditInputs
    }), null, 2)}\n`
  );
} else if (options.validate) {
  process.stdout.write(
    `${JSON.stringify(validatePacket(options.validate), null, 2)}\n`
  );
} else {
  const result = buildPacket({
    repoRoot,
    outputRoot: options.output,
    cacheRoot: options.cache
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (![
      "--audit-inputs",
      "--output",
      "--cache",
      "--validate"
    ].includes(flag)) {
      throw new Error(
        "Usage: build-d2c-packet.js --output <path> --cache <path> | --validate <packet> | --audit-inputs <packet>"
      );
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }
    parsed[flag.slice(2)] = value;
    index += 1;
  }
  if (parsed["audit-inputs"]) {
    if (parsed.output || parsed.cache || parsed.validate) {
      throw new Error("--audit-inputs cannot be combined with other options.");
    }
    return { auditInputs: parsed["audit-inputs"] };
  }
  if (parsed.validate) {
    if (parsed.output || parsed.cache) {
      throw new Error("--validate cannot be combined with build options.");
    }
    return parsed;
  }
  if (!parsed.output || !parsed.cache) {
    throw new Error("--output and --cache are required.");
  }
  return parsed;
}
