#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLabelDocket,
  buildRankingDocket,
  materializePhase1Instance,
  validateLabelDocket,
  validatePhase1Result,
  validateRankingDocket,
  validateRankingResult
} from "./lib/d2d-dual-docket.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const options = parseArgs(process.argv.slice(2));
let result;

if (options.mode === "build-ranking") {
  result = buildRankingDocket({
    repoRoot,
    packetRoot: options.comparativePacket,
    outputRoot: options.destination
  });
} else if (options.mode === "build-label") {
  result = buildLabelDocket({
    repoRoot,
    packetRoot: options.comparativePacket,
    outputRoot: options.destination
  });
} else if (options.mode === "validate-ranking") {
  result = validateRankingDocket(options.destination);
} else if (options.mode === "validate-label") {
  result = validateLabelDocket(options.destination);
} else if (options.mode === "validate-ranking-result") {
  const validation = validateRankingDocket(options.destination, {
    allowedOutputFiles: ["ranking-result.json"]
  });
  const reviewResult = readJson(
    path.join(validation.packet_root, "output", "ranking-result.json")
  );
  validateRankingResult(reviewResult, validation);
  result = {
    formal_result_valid: true,
    result_sha256: fileSha256(
      path.join(
        validation.packet_root,
        "output",
        "ranking-result.json"
      )
    ),
    packet_hash: validation.packet_hash
  };
} else if (options.mode === "validate-phase1-result") {
  const validation = validateLabelDocket(options.destination, {
    allowedOutputFiles: ["phase1-result.json"]
  });
  const reviewResult = readJson(
    path.join(validation.packet_root, "output", "phase1-result.json")
  );
  validatePhase1Result(reviewResult, validation);
  result = {
    formal_result_valid: true,
    result_sha256: fileSha256(
      path.join(
        validation.packet_root,
        "output",
        "phase1-result.json"
      )
    ),
    packet_hash: validation.packet_hash
  };
} else if (options.mode === "materialize-phase1") {
  result = materializePhase1Instance({
    canonicalRoot: options.canonical,
    governance: options.governance,
    outputRoot: options.destination
  });
} else {
  throw new Error("Unsupported D.2D mode.");
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function parseArgs(args) {
  const output = {
    comparativePacket: "/private/tmp/kanon-d2c-comparative-v1"
  };
  const modes = new Set([
    "build-ranking",
    "build-label",
    "validate-ranking",
    "validate-label",
    "validate-ranking-result",
    "validate-phase1-result",
    "materialize-phase1"
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag.startsWith("--") && modes.has(flag.slice(2))) {
      if (output.mode) {
        throw new Error("Select exactly one D.2D mode.");
      }
      output.mode = flag.slice(2);
      continue;
    }
    if (
      ![
        "--canonical",
        "--comparative-packet",
        "--destination",
        "--governance"
      ].includes(flag)
    ) {
      throw new Error(usage());
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }
    output[
      flag.slice(2).replace(
        /-([a-z])/g,
        (_match, character) => character.toUpperCase()
      )
    ] = value;
    index += 1;
  }
  if (!output.mode || !output.destination) {
    throw new Error(usage());
  }
  if (
    output.mode === "materialize-phase1" &&
    (!output.canonical || !output.governance)
  ) {
    throw new Error(
      "--materialize-phase1 requires --canonical and --governance."
    );
  }
  return output;
}

function usage() {
  return "Usage: d2d-dual-docket.js --build-ranking|--build-label|--validate-ranking|--validate-label|--validate-ranking-result|--validate-phase1-result|--materialize-phase1 --destination PATH [--comparative-packet PATH] [--canonical PATH --governance PATH]";
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fileSha256(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}
