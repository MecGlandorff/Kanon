#!/usr/bin/env node

import fs from "node:fs";
import { runGit } from "../src/git-runner.js";
import { resolveContainedPath } from "../src/path-security.js";
import { VERSION } from "../src/version.js";
import {
  releasePolicyFromEnvironment,
  validateReleasePolicy
} from "./lib/maintainer-stable-release.js";

const root = process.cwd();
const expectedCommit = process.env.KANON_CANDIDATE_COMMIT;
const expectedVersion = process.env.KANON_CANDIDATE_VERSION;
const releaseKind = process.env.KANON_RELEASE_KIND;

if (!/^[0-9a-f]{40}$/.test(expectedCommit || "")) {
  throw new Error("KANON_CANDIDATE_COMMIT must be a full Git SHA.");
}
if (!expectedVersion) {
  throw new Error("KANON_CANDIDATE_VERSION is required.");
}
const head = checkedGit(["rev-parse", "HEAD"]).trim();
if (head !== expectedCommit) {
  throw new Error(`Checked out ${head}; expected ${expectedCommit}.`);
}
const status = checkedGit([
  "status",
  "--porcelain=v1",
  "--untracked-files=all"
]);
if (status.trim()) {
  throw new Error("Candidate checkout is not clean.");
}
const packageFile = resolveContainedPath(root, "package.json", {
  type: "file"
});
if (!packageFile.ok || packageFile.stat.size > 256 * 1024) {
  throw new Error(
    `Candidate package.json is unsafe: ${
      packageFile.reason || "file exceeds 256 KiB"
    }`
  );
}
const pkg = JSON.parse(fs.readFileSync(packageFile.path, "utf8"));
if (pkg.version !== expectedVersion || VERSION !== expectedVersion) {
  throw new Error(
    `Version mismatch: input=${expectedVersion}, package=${pkg.version}, runtime=${VERSION}.`
  );
}
validateReleasePolicy(root, {
  candidateVersion: expectedVersion,
  releaseKind,
  ...releasePolicyFromEnvironment()
});
process.stdout.write(
  `Candidate ${expectedCommit} is clean at ${expectedVersion}.\n`
);

function checkedGit(args) {
  const result = runGit(root, args, {
    timeoutMs: 10_000,
    maxOutputBytes: 8 * 1024 * 1024
  });
  if (!result.ok) {
    throw new Error(
      `Git candidate check failed: ${result.diagnostic} ${result.stderr}`
    );
  }
  return result.stdout;
}
