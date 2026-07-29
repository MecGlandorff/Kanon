#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  preserveAndUnblind,
  validateCompletedReview,
  validateRetainedPacket
} from "./lib/d2c-unblind.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const FROZEN = Object.freeze({
  caseCount: 28,
  corpusManifestSha256:
    "4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92",
  itemCount: 94,
  packetHash:
    "abe906e1291086dc3803eb8d4153e6a5aede85b8b4e7ae4e18d99b8f44bc3979",
  packetManifestSha256:
    "008c3b271813820e934d73fbc777901b5139bc38e6b8d3e172f91d21ae939ef4",
  preparationCommit: "372e66cddf4dd65fc4d87e6e982f1c90b9e11d73",
  rawReportSha256:
    "747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3",
  restoredArtifactSha256:
    "89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a",
  reviewResultSha256:
    "838ebcccccc7ae9a8df24e631a5ecd48718fa150d75d6e1648434b5308bd4c66",
  reviewerPromptSha256:
    "f633b9139b5f03be449de7480276508d7848851872ec97bb12bd95c986040ac6"
});
const options = parseArgs(process.argv.slice(2));
const input = {
  repoRoot,
  packetRoot: options.packet,
  expected: FROZEN
};

if (options.mode === "validate-static") {
  process.stdout.write(
    `${JSON.stringify(validateRetainedPacket(input), null, 2)}\n`
  );
} else if (options.mode === "validate-result") {
  const validated = validateCompletedReview(input);
  process.stdout.write(
    `${JSON.stringify({
      static_packet: validated.static_packet,
      formal_result_valid: validated.formal_result_valid,
      schema_version: validated.schema_version,
      item_count: validated.item_count,
      unique_item_count: validated.unique_item_count,
      result_sha256: validated.result_sha256
    }, null, 2)}\n`
  );
} else {
  const preserved = preserveAndUnblind({
    ...input,
    destinationName: options.destination
  });
  process.stdout.write(
    `${JSON.stringify({
      destination: preserved.destination,
      preserved_result: preserved.preserved_result,
      preserved_result_sha256: preserved.preserved_result_sha256,
      unblinded_analysis: preserved.unblinded_analysis,
      item_count: preserved.analysis.item_count,
      case_count: preserved.analysis.case_count,
      matrices: preserved.analysis.matrices
    }, null, 2)}\n`
  );
}

function parseArgs(args) {
  const output = {
    packet: "/private/tmp/kanon-d2c-review-v1"
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if ([
      "--validate-static",
      "--validate-result",
      "--preserve-and-unblind"
    ].includes(flag)) {
      if (output.mode) {
        throw new Error("Select exactly one D.2C unblinding mode.");
      }
      output.mode = flag.slice(2);
      continue;
    }
    if (!["--packet", "--destination"].includes(flag)) {
      throw new Error(
        "Usage: d2c-unblind.js --validate-static|--validate-result|--preserve-and-unblind [--packet <path>] [--destination <name>]"
      );
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }
    output[flag.slice(2)] = value;
    index += 1;
  }
  if (!output.mode) {
    throw new Error("Select exactly one D.2C unblinding mode.");
  }
  if (output.mode !== "preserve-and-unblind" && output.destination) {
    throw new Error("--destination requires --preserve-and-unblind.");
  }
  return output;
}
