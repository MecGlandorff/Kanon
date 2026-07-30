#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeTerminalText } from "../src/trust.js";
import { canonicalJson } from "./lib/d2e-evidence.js";
import {
  createPostCorrectionEvidence,
  validatePostCorrectionAttempt,
  verifyFrozenPostCorrectionInputs
} from "./lib/d2e-post-correction.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "verify-inputs") {
    const result = verifyFrozenPostCorrectionInputs(repoRoot);
    process.stdout.write(
      `${canonicalJson({
        authority_sha256: result.authority_sha256,
        cache: result.cache,
        counts: result.counts,
        immutable: result.immutable,
        strict_historical_equivalence:
          result.strict_historical_equivalence
      })}\n`
    );
  } else if (options.mode === "validate-attempt") {
    const result = validatePostCorrectionAttempt(
      repoRoot,
      options.attempt
    );
    process.stdout.write(
      `${canonicalJson({
        attempt_complete_tree_sha256: result.inventory.sha256,
        candidate_count: result.manifest.candidate_count,
        case_count: result.manifest.case_count,
        eligible_candidate_count:
          result.manifest.eligible_candidate_count,
        observer_failure_count:
          result.manifest.observer_failure_count,
        trace_bytes: result.manifest.trace_bytes,
        trace_on_off_equivalence:
          result.manifest.trace_on_off_equivalence,
        trace_set_sha256: result.manifest.trace_set_sha256
      })}\n`
    );
  } else {
    const result = createPostCorrectionEvidence(
      repoRoot,
      options.attempt
    );
    process.stdout.write(
      `${canonicalJson({
        attempt_complete_tree_sha256:
          result.attempt_complete_tree_sha256,
        comparison_sha256: result.comparison_sha256,
        conclusion: result.conclusion,
        destination: result.destination_relative,
        evaluation_record_sha256:
          result.evaluation_record_sha256,
        evidence_complete_tree_sha256:
          result.evidence_complete_tree_sha256,
        evidence_manifest_sha256:
          result.evidence_manifest_sha256
      })}\n`
    );
  }
} catch (error) {
  process.stderr.write(
    `Post-correction evaluation error: ${safeTerminalText(
      error?.message || error
    ).slice(0, 2_000)}\n`
  );
  process.exitCode = 2;
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--verify-inputs") {
    return { mode: "verify-inputs" };
  }
  if (
    argv.length === 3 &&
    (argv[0] === "--validate-attempt" ||
      argv[0] === "--compare") &&
    argv[1] === "--attempt" &&
    typeof argv[2] === "string" &&
    argv[2].length > 0
  ) {
    return {
      attempt: path.resolve(argv[2]),
      mode:
        argv[0] === "--compare"
          ? "compare"
          : "validate-attempt"
    };
  }
  throw new Error(
    "Usage: d2e-post-correction.js --verify-inputs | " +
      "--validate-attempt --attempt <directory> | " +
      "--compare --attempt <directory>"
  );
}
