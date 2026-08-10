#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { preserveRankingEvidence } from "./lib/d2d-ranking-result.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const options = parseArgs(process.argv.slice(2));
const result = preserveRankingEvidence({
  repoRoot,
  packetRoot: options.packet,
  expected: {
    preparationCommit: "bf0230b8989feb957a1a9882383144918ba5c519",
    packetHash:
      "fbe887a7fde985b7abdef7edc69c7f7b814d55339749c333bce8943c9f0fac5d",
    packetManifestSha256:
      "f24964b65ad7d72e570b18aa9205b76e1b359f0e7b45efe9e3b8697c4b1e032f",
    snapshotTreeSha256:
      "0368ca4cbc6abd1679d6cabece7c34719edd07964479efa6e28a5c5d0cbdd82e",
    productionSourceSha256:
      "ae099b22fb31ee950b27bfa930d557aa3c97c5f6e9dd2e841663d1817625bbf2",
    reviewerPromptSha256:
      "e01ce4c96e7236b992d79a97d871272c5edba2d8079b49d5c439448774ac7437",
    resultSchemaSha256:
      "e85cda3d4b282b12eaa6893d9b89ecdfb149728c0969a5167f9c2b7d6e506daf",
    caseCount: 28,
    candidateCount: 185,
    productionArtifactSha256:
      "89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a"
  }
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function parseArgs(args) {
  if (
    args.length !== 2 ||
    args[0] !== "--packet" ||
    !path.isAbsolute(args[1])
  ) {
    throw new Error(
      "Usage: d2d-ranking-result.js --packet /absolute/ranking/packet"
    );
  }
  return { packet: args[1] };
}
