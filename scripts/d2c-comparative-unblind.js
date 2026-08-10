#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  preserveAndUnblindComparative,
  reproduceComparativeAnalysis,
  validateComparativeStatic,
  validateCompletedComparativeEvidence
} from "./lib/d2c-comparative-unblind.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const PRIOR = Object.freeze({
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
const FROZEN = Object.freeze({
  preparationCommit: "3be7c2567e8f790c2a887dc1fa8bd6abf4f5ff6d",
  restoredArtifactSha256:
    "89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a",
  rawReportSha256:
    "747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3",
  corpusManifestSha256:
    "4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92",
  priorReviewResultSha256:
    "838ebcccccc7ae9a8df24e631a5ecd48718fa150d75d6e1648434b5308bd4c66",
  priorUnblindedAnalysisSha256:
    "2a2db5e02af6ac6fd815f5cc54fa9fc6130535119ede72caa07bdfa0e1df95c7",
  comparativePreparationSha256:
    "b722f61aacf20e9dc838dd923dd1d9a298cce6924a4e5c8e0c0e09c13a7cdec7",
  canonicalInputSha256:
    "4f5c55cd08a4898fb7d7b825f3c17361ab3394f5f686508ba9149bd2c5ce8b48",
  reviewerPromptSha256:
    "96b25cee9a79a0ce42b22469fc522d6f4d78db459f5f2cc00f4112011e476670",
  resultSchemaSha256:
    "78e732babb4b4a98ef2a9f607636d82b8e8ccdd4a1a2811333799fc9d8aff96a",
  reviewCasesSha256:
    "392ceb6cf3e10d8f19d04a51d2b0d4754c17a97ff516080db76c9765135ed990",
  sourceCaseSnapshotsSha256:
    "4ad546ef3e7950697f80de7480a98cecc4f5e69de3b1bb7978fe302d228730b6",
  comparativeCaseSnapshotsSha256:
    "0368ca4cbc6abd1679d6cabece7c34719edd07964479efa6e28a5c5d0cbdd82e",
  packetManifestSha256:
    "fc559d607c3facd39b6a4801005335dd98c47131573951bdd7f4a979ea792621",
  packetHash:
    "2850b73d1095fb6dd58e4430eaf0a961a97d1441dfad491a5374f8393dbd222a",
  caseCount: 28,
  candidateCount: 185,
  consensusCount: 91,
  priorItemCount: 94,
  excludedExactAgreementCount: 2,
  prior: PRIOR
});

const options = parseArgs(process.argv.slice(2));
const input = {
  repoRoot,
  packetRoot: options.packet,
  priorPacketRoot: options.priorPacket,
  expected: FROZEN
};

if (options.mode === "validate-static") {
  process.stdout.write(
    `${JSON.stringify(validateComparativeStatic(input), null, 2)}\n`
  );
} else if (options.mode === "validate-result") {
  const validated = validateCompletedComparativeEvidence(input);
  process.stdout.write(
    `${JSON.stringify({
      formal_result_valid: validated.formal_result_valid,
      schema_version: validated.schema_version,
      case_count: validated.case_count,
      unique_case_count: validated.unique_case_count,
      result_sha256: validated.result_sha256,
      result_bytes: validated.result_bytes.length,
      controlled_inputs_unchanged:
        validated.controlled_inputs_unchanged
    }, null, 2)}\n`
  );
} else if (options.mode === "preserve-and-unblind") {
  const preserved = preserveAndUnblindComparative({
    ...input,
    predeclarationCommit: options.predeclarationCommit,
    destinationName: options.destination
  });
  process.stdout.write(
    `${JSON.stringify({
      destination: preserved.destination,
      preserved_result: preserved.preserved_result,
      preserved_result_sha256: preserved.preserved_result_sha256,
      preserved_result_bytes: preserved.preserved_result_bytes,
      unblinded_analysis: preserved.unblinded_analysis,
      unblinded_analysis_sha256:
        preserved.unblinded_analysis_sha256,
      counts: preserved.analysis.counts,
      matrices: preserved.analysis.matrices,
      reviewer_agreement: preserved.analysis.reviewer_agreement
    }, null, 2)}\n`
  );
} else {
  process.stdout.write(
    `${JSON.stringify(reproduceComparativeAnalysis({
      ...input,
      predeclarationCommit: options.predeclarationCommit,
      analysisFile: options.analysis
    }), null, 2)}\n`
  );
}

function parseArgs(args) {
  const output = {
    packet: "/private/tmp/kanon-d2c-comparative-v1",
    priorPacket: "/private/tmp/kanon-d2c-review-v1"
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if ([
      "--validate-static",
      "--validate-result",
      "--preserve-and-unblind",
      "--reproduce"
    ].includes(flag)) {
      if (output.mode) {
        throw new Error("Select exactly one comparative unblinding mode.");
      }
      output.mode = flag.slice(2);
      continue;
    }
    if (![
      "--packet",
      "--prior-packet",
      "--predeclaration-commit",
      "--destination",
      "--analysis"
    ].includes(flag)) {
      throw new Error(
        "Usage: d2c-comparative-unblind.js --validate-static|--validate-result|--preserve-and-unblind|--reproduce [options]"
      );
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }
    output[flag.slice(2).replace(
      /-([a-z])/g,
      (_match, character) => character.toUpperCase()
    )] = value;
    index += 1;
  }
  if (!output.mode) {
    throw new Error("Select exactly one comparative unblinding mode.");
  }
  if (
    ["preserve-and-unblind", "reproduce"].includes(output.mode) &&
    !/^[0-9a-f]{40}$/.test(output.predeclarationCommit || "")
  ) {
    throw new Error(
      "Preservation and reproduction require the full predeclaration commit."
    );
  }
  if (output.mode === "reproduce" && !output.analysis) {
    throw new Error("--reproduce requires --analysis.");
  }
  if (
    output.mode !== "preserve-and-unblind" &&
    output.destination
  ) {
    throw new Error("--destination requires --preserve-and-unblind.");
  }
  return output;
}
