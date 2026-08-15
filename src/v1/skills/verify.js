import {
  buildContinuityArtifactMetadata,
  buildContinuityReport
} from "#kanon-continuity";
import {
  verifyContextReceipt
} from "../core/receipt.js";
import {
  readContextReceiptStore
} from "../core/receipt-store.js";
import {
  isPlainRecord,
  repositoryIdentifier,
  repositoryValue,
  sanitizeDisplayText
} from "../core/trust.js";
import {
  inspectPersistedContinuity,
  inspectRepository,
  publicInspection
} from "../repository/inspect.js";
import { REPOSITORY_TRUST_BOUNDARY } from "./orient.js";

const MAX_CLAIMS = 24;
const MAX_GENERATED_PAIRS = 64;

/**
 * @typedef {{
 *   root: string,
 *   task: string,
 *   target: string,
 *   receipt?: unknown
 * }} VerifyInput
 * @typedef {{
 *   git_runner?: import("../repository/git.js").GitRunner,
 *   now?: number,
 *   plugin_data_root?: unknown,
 *   receipt_host_evidence?: unknown
 * }} VerifyContext
 * @typedef {{
 *   status: "Known" | "Stale" | "Unknown",
 *   scope: "observed-target-and-package-script-claims",
 *   contradictions: {
 *     classification: "direct-contradiction",
 *     claim: string,
 *     repository_value: import("../core/trust.js").RepositoryValue
 *   }[],
 *   non_observations: {
 *     classification: "non-observation",
 *     claim: string,
 *     repository_value: import("../core/trust.js").RepositoryValue | null
 *   }[],
 *   claims_truncated: boolean,
 *   diagnostics: string[]
 * }} DocumentationVerification
 * @typedef {{
 *   status: "Known" | "Stale" | "Unknown",
 *   scope: "observed-pairs-only",
 *   compared: number,
 *   matching: number,
 *   contradictions: {
 *     source: import("../core/trust.js").RepositoryValue,
 *     generated: import("../core/trust.js").RepositoryValue,
 *     classification: "direct-contradiction"
 *   }[],
 *   contradictions_truncated: boolean,
 *   non_observations: string[]
 * }} GeneratedVerification
 * @typedef {{
 *   status: "Known" | "Unknown",
 *   scope: "conventional-package-scripts",
 *   declarations: {
 *     name: import("../core/trust.js").RepositoryValue,
 *     command: import("../core/trust.js").RepositoryValue,
 *     classification: "declaration"
 *   }[],
 *   declarations_truncated: boolean,
 *   execution_status: "Unknown",
 *   diagnostic: string
 * }} ValidationVerification
 * @typedef {{
 *   schema: "kanon-verify-report-v1",
 *   ok: true,
 *   status: "Known" | "Stale" | "Unknown",
 *   read_only: true,
 *   repository_read_only: true,
 *   enforcement: false,
 *   trust_boundary: string,
 *   live: NonNullable<ReturnType<typeof publicInspection>>,
 *   documentation: DocumentationVerification,
 *   continuity: ReturnType<typeof buildContinuityReport>,
 *   generated_artifacts: GeneratedVerification,
 *   declared_validation: ValidationVerification,
 *   receipt: import("../core/receipt.js").ReceiptVerification,
 *   receipt_source: {
 *     status: "Known",
 *     medium: "explicit-input" | "plugin-data",
 *     diagnostic: string
 *   } | {
 *     status: "Unknown",
 *     medium: "unavailable",
 *     diagnostic: string
 *   },
 *   diagnostics: string[]
 * } | {
 *   schema: "kanon-verify-report-v1",
 *   ok: false,
 *   status: "Unknown",
 *   read_only: true,
 *   repository_read_only: true,
 *   enforcement: false,
 *   trust_boundary: string,
 *   diagnostic: string,
 *   diagnostics: string[]
 * }} VerifyReport
 */

/**
 * @param {VerifyInput} input
 * @param {VerifyContext} [context]
 * @returns {VerifyReport}
 */
export function runVerify(input, context = {}) {
  const inspection = inspectRepository(input.root, input.task, {
    profile: "verify",
    target: input.target,
    ...(context.git_runner === undefined
      ? {}
      : { git_runner: context.git_runner })
  });
  if (!inspection.ok) {
    return unavailableVerify(
      inspection.diagnostic,
      inspection.diagnostics
    );
  }
  const visible = publicInspection(inspection);
  if (visible === null) {
    return unavailableVerify(
      "Live repository evidence was unavailable.",
      []
    );
  }

  const documentation = verifyDocumentation(
    inspection,
    input.target
  );
  const generatedArtifacts = verifyGeneratedArtifacts(inspection);
  const declaredValidation = verifyDeclaredValidation(inspection);
  const persisted = inspectPersistedContinuity(inspection.root);
  const currentState = {
    ...inspection.current_state,
    verification: {
      issues: documentation.contradictions.map((item) => ({
        conclusion: "contradiction",
        claim: item.claim
      }))
    }
  };
  const continuity = buildContinuityReport({
    artifact_metadata: buildContinuityArtifactMetadata({
      files: inspection.files.map((file) => ({
        path: file.path,
        mtime_ms: file.mtime_ms
      }))
    }),
    current: currentState,
    previous: persisted.previous,
    ...(persisted.previous_warning === null
      ? {}
      : { previous_warning: persisted.previous_warning }),
    handoff: persisted.handoff,
    ...(context.now === undefined ? {} : { now: context.now })
  });
  const now = context.now === undefined ? Date.now() : context.now;
  const receiptSelection = selectReceipt(
    input.receipt,
    context.plugin_data_root,
    inspection.root,
    now
  );
  const receipt = verifyContextReceipt(receiptSelection.receipt, {
    root: inspection.root,
    task: inspection.task,
    evidence_sha256: inspection.evidence_fingerprint,
    evidence_complete: inspection.evidence_complete,
    host_evidence: context.receipt_host_evidence,
    now
  });
  const status = aggregateStatus([
    documentation.status,
    generatedArtifacts.status,
    declaredValidation.status,
    declaredValidation.execution_status,
    continuity.ok ? continuity.status : "Unknown",
    receipt.status
  ]);
  return {
    schema: "kanon-verify-report-v1",
    ok: true,
    status,
    read_only: true,
    repository_read_only: true,
    enforcement: false,
    trust_boundary: REPOSITORY_TRUST_BOUNDARY,
    live: visible,
    documentation,
    continuity,
    generated_artifacts: generatedArtifacts,
    declared_validation: declaredValidation,
    receipt,
    receipt_source: receiptSelection.source,
    diagnostics: Array.from(
      new Set([
        ...inspection.coverage.diagnostics,
        ...documentation.diagnostics,
        ...(persisted.previous_warning === null
          ? []
          : [persisted.previous_warning]),
        ...(persisted.handoff_warning === null
          ? []
          : [persisted.handoff_warning]),
        ...continuity.diagnostics,
        ...(receiptSelection.source.status === "Unknown"
          ? [receiptSelection.source.diagnostic]
          : [])
      ])
    ).slice(0, 16)
  };
}

/**
 * @param {Extract<import("../repository/inspect.js").RepositoryInspection, {ok: true}>} inspection
 * @param {string} target
 * @returns {DocumentationVerification}
 */
function verifyDocumentation(inspection, target) {
  const selected = findEvidence(inspection, target);
  /** @type {DocumentationVerification["contradictions"]} */
  const contradictions = [];
  /** @type {DocumentationVerification["non_observations"]} */
  const nonObservations = [];
  /** @type {string[]} */
  const diagnostics = [];
  if (!selected) {
    nonObservations.push({
      classification: "non-observation",
      claim:
        "The requested documentation was not observed; this is not a contradiction.",
        repository_value: repositoryIdentifier(target, 4_096)
    });
    if (!inspection.evidence_complete) {
      diagnostics.push(
        "Incomplete evidence prevents a documentation-absence conclusion."
      );
    }
    return {
      status: "Unknown",
      scope: "observed-target-and-package-script-claims",
      contradictions,
      non_observations: nonObservations,
      claims_truncated: false,
      diagnostics
    };
  }

  const packageEvidence = findEvidence(inspection, "package.json");
  const packageJson = parseJsonObject(packageEvidence?.content);
  const scripts = packageJson.ok && isPlainRecord(packageJson.value.scripts)
    ? packageJson.value.scripts
    : null;
  for (const declaration of extractPackageCommands(selected.content)) {
    if (scripts === null) {
      nonObservations.push({
        classification: "non-observation",
        claim:
          "A documentation command declaration could not be compared with complete package metadata.",
        repository_value: repositoryValue(declaration.rendered, 512)
      });
      continue;
    }
    if (
      !Object.hasOwn(scripts, declaration.script) ||
      typeof scripts[declaration.script] !== "string"
    ) {
      contradictions.push({
        classification: "direct-contradiction",
        claim:
          "Documentation declares a package script that parsed package metadata directly does not declare.",
        repository_value: repositoryValue(declaration.rendered, 512)
      });
    }
  }
  const observedPaths = new Set(
    inspection.files.map((file) => file.path)
  );
  for (const referencedPath of extractDocumentPaths(selected.content)) {
    if (!observedPaths.has(referencedPath)) {
      nonObservations.push({
        classification: "non-observation",
        claim:
          "A documented path was not observed; missing support evidence is not a direct contradiction.",
        repository_value: repositoryIdentifier(referencedPath, 4_096)
      });
    }
  }
  if (!inspection.evidence_complete) {
    diagnostics.push(
      "Incomplete, excluded, unreadable, or bounded evidence prevents absence conclusions."
    );
  }
  const claimsTruncated =
    contradictions.length > MAX_CLAIMS ||
    nonObservations.length > MAX_CLAIMS;
  if (claimsTruncated) {
    diagnostics.push(
      "Documentation claim output reached its limit; remaining claims stay Unknown."
    );
  }
  return {
    status:
      contradictions.length > 0
        ? "Stale"
        : !inspection.evidence_complete ||
            nonObservations.length > 0 ||
            claimsTruncated
          ? "Unknown"
          : "Known",
    scope: "observed-target-and-package-script-claims",
    contradictions: contradictions.slice(0, MAX_CLAIMS),
    non_observations: nonObservations.slice(0, MAX_CLAIMS),
    claims_truncated: claimsTruncated,
    diagnostics
  };
}

/**
 * @param {Extract<import("../repository/inspect.js").RepositoryInspection, {ok: true}>} inspection
 * @returns {GeneratedVerification}
 */
function verifyGeneratedArtifacts(inspection) {
  const files = new Map(inspection.files.map((file) => [file.path, file]));
  /** @type {GeneratedVerification["contradictions"]} */
  const contradictions = [];
  /** @type {string[]} */
  const nonObservations = [];
  let compared = 0;
  let matching = 0;
  let candidates = 0;
  for (const file of inspection.files) {
    const generated = generatedCounterpart(file.path);
    if (!generated) {
      continue;
    }
    if (candidates >= MAX_GENERATED_PAIRS) {
      nonObservations.push(
        "The generated-artifact comparison limit was reached; remaining pairs stay Unknown."
      );
      continue;
    }
    candidates += 1;
    const target = files.get(generated);
    if (!target) {
      nonObservations.push(
        "A conventional generated counterpart was not observed; no synchronization conclusion was made."
      );
      continue;
    }
    if (file.sha256 === null || target.sha256 === null) {
      nonObservations.push(
        "A generated-artifact hash was unavailable, so synchronization remains Unknown."
      );
      continue;
    }
    compared += 1;
    if (file.sha256 === target.sha256) {
      matching += 1;
    } else {
      contradictions.push({
        source: repositoryIdentifier(file.path, 4_096),
        generated: repositoryIdentifier(target.path, 4_096),
        classification: "direct-contradiction"
      });
    }
  }
  compareGeneratedMetadata(inspection, contradictions, nonObservations);
  const incomplete =
    !inspection.evidence_complete ||
    nonObservations.length > 0 ||
    compared === 0;
  const contradictionsTruncated =
    contradictions.length > MAX_GENERATED_PAIRS;
  return {
    status:
      contradictions.length > 0
        ? "Stale"
        : incomplete
          ? "Unknown"
          : "Known",
    scope: "observed-pairs-only",
    compared,
    matching,
    contradictions: contradictions.slice(0, MAX_GENERATED_PAIRS),
    contradictions_truncated: contradictionsTruncated,
    non_observations: Array.from(new Set(nonObservations)).slice(0, 16)
  };
}

/**
 * @param {Extract<import("../repository/inspect.js").RepositoryInspection, {ok: true}>} inspection
 * @param {GeneratedVerification["contradictions"]} contradictions
 * @param {string[]} nonObservations
 * @returns {void}
 */
function compareGeneratedMetadata(
  inspection,
  contradictions,
  nonObservations
) {
  const packageJson = parseJsonObject(
    findEvidence(inspection, "package.json")?.content
  );
  const buildMetadata = parseJsonObject(
    findEvidence(inspection, "runtime/build-metadata.json")?.content
  );
  if (!packageJson.ok || !buildMetadata.ok) {
    nonObservations.push(
      "Package and embedded build metadata were not both available for comparison."
    );
    return;
  }
  if (
    typeof packageJson.value.version !== "string" ||
    typeof buildMetadata.value.package_version !== "string"
  ) {
    nonObservations.push(
      "Package or embedded version metadata was malformed."
    );
    return;
  }
  if (packageJson.value.version !== buildMetadata.value.package_version) {
    contradictions.push({
      source: repositoryIdentifier("package.json", 4_096),
      generated: repositoryIdentifier("runtime/build-metadata.json", 4_096),
      classification: "direct-contradiction"
    });
  }
}

/**
 * @param {Extract<import("../repository/inspect.js").RepositoryInspection, {ok: true}>} inspection
 * @returns {ValidationVerification}
 */
function verifyDeclaredValidation(inspection) {
  const packageJson = parseJsonObject(
    findEvidence(inspection, "package.json")?.content
  );
  if (!packageJson.ok || !isPlainRecord(packageJson.value.scripts)) {
    return {
      status: "Unknown",
      scope: "conventional-package-scripts",
      declarations: [],
      declarations_truncated: false,
      execution_status: "Unknown",
      diagnostic:
        "Declared validation metadata was unavailable or invalid; no execution success was inferred."
    };
  }
  const candidates = Object.entries(packageJson.value.scripts)
    .filter(
      ([name, command]) =>
        typeof command === "string" &&
        /(?:^|:)(?:build|check|ci|lint|test|typecheck|validate|verify)(?::|$)/.test(
          name
        )
    );
  const declarations = candidates
    .slice(0, 16)
    .map(([name, command]) => ({
      name: repositoryValue(name, 256),
      command: repositoryValue(command, 2_048),
      classification: /** @type {"declaration"} */ ("declaration")
    }));
  return {
    status: candidates.length > 16 ? "Unknown" : "Known",
    scope: "conventional-package-scripts",
    declarations,
    declarations_truncated: candidates.length > 16,
    execution_status: "Unknown",
    diagnostic:
      candidates.length > 16
        ? "Declared validation exceeded the 16-command output limit; retained commands are declarations only and execution remains Unknown."
        : "Validation commands are declarations only. Kanon did not execute them and does not claim success."
  };
}

/**
 * @param {Extract<import("../repository/inspect.js").RepositoryInspection, {ok: true}>} inspection
 * @param {string} selectedPath
 * @returns {import("../repository/inspect.js").RepositoryEvidence | undefined}
 */
function findEvidence(inspection, selectedPath) {
  return inspection.evidence.find((item) => item.path === selectedPath);
}

/**
 * @param {unknown} content
 * @returns {{
 *   ok: true,
 *   value: Record<string, unknown>
 * } | {ok: false}}
 */
function parseJsonObject(content) {
  if (typeof content !== "string") {
    return { ok: false };
  }
  try {
    const value = JSON.parse(content);
    return isPlainRecord(value) ? { ok: true, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * @param {string} markdown
 * @returns {{script: string, rendered: string}[]}
 */
function extractPackageCommands(markdown) {
  /** @type {{script: string, rendered: string}[]} */
  const declarations = [];
  const pattern =
    /\b(?:npm\s+run\s+([A-Za-z0-9:_-]+)|npm\s+(test|start)|pnpm\s+(?:run\s+)?([A-Za-z0-9:_-]+)|yarn\s+([A-Za-z0-9:_-]+))\b/g;
  for (const match of markdown.matchAll(pattern)) {
    const script = match[1] || match[2] || match[3] || match[4];
    if (script) {
      declarations.push({
        script,
        rendered: sanitizeDisplayText(match[0], 512)
      });
    }
  }
  return declarations.slice(0, MAX_CLAIMS + 1);
}

/**
 * @param {string} markdown
 * @returns {string[]}
 */
function extractDocumentPaths(markdown) {
  /** @type {string[]} */
  const paths = [];
  for (const match of markdown.matchAll(
    /`((?:src|lib|app|docs|test|tests|scripts)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)`/g
  )) {
    const selected = match[1];
    if (
      selected &&
      !selected.includes("..") &&
      !paths.includes(selected)
    ) {
      paths.push(selected);
    }
  }
  return paths.slice(0, MAX_CLAIMS + 1);
}

/**
 * @param {string} source
 * @returns {string | null}
 */
function generatedCounterpart(source) {
  if (source === "src/v1/build-metadata.json") {
    return "runtime/build-metadata.json";
  }
  if (source === "src/v1/bin/kanon.js") {
    return "runtime/bin/kanon-v1.js";
  }
  if (source.startsWith("src/v1/") && source.endsWith(".js")) {
    return `runtime/${source.slice("src/v1/".length)}`;
  }
  if (source.startsWith("src/continuity/") && source.endsWith(".js")) {
    return `runtime/src/${source.slice("src/".length)}`;
  }
  return null;
}

/**
 * @param {("Known" | "Stale" | "Unknown")[]} statuses
 * @returns {"Known" | "Stale" | "Unknown"}
 */
function aggregateStatus(statuses) {
  return statuses.includes("Stale")
    ? "Stale"
    : statuses.includes("Unknown")
      ? "Unknown"
      : "Known";
}

/**
 * @param {string} diagnostic
 * @param {string[]} diagnostics
 * @returns {VerifyReport}
 */
function unavailableVerify(diagnostic, diagnostics) {
  return {
    schema: "kanon-verify-report-v1",
    ok: false,
    status: "Unknown",
    read_only: true,
    repository_read_only: true,
    enforcement: false,
    trust_boundary: REPOSITORY_TRUST_BOUNDARY,
    diagnostic,
    diagnostics
  };
}

/**
 * Prefer an explicitly supplied receipt. Otherwise read only the fixed,
 * bounded plugin-data store; never fall back to repository state.
 *
 * @param {unknown} explicitReceipt
 * @param {unknown} pluginDataRoot
 * @param {string} repositoryRoot
 * @param {number} now
 * @returns {{
 *   receipt: unknown,
 *   source: {
 *     status: "Known",
 *     medium: "explicit-input" | "plugin-data",
 *     diagnostic: string
 *   } | {
 *     status: "Unknown",
 *     medium: "unavailable",
 *     diagnostic: string
 *   }
 * }}
 */
function selectReceipt(
  explicitReceipt,
  pluginDataRoot,
  repositoryRoot,
  now
) {
  if (explicitReceipt !== undefined) {
    return {
      receipt: explicitReceipt,
      source: {
        status: /** @type {"Known"} */ ("Known"),
        medium: /** @type {"explicit-input"} */ ("explicit-input"),
        diagnostic:
          "Receipt input was supplied explicitly and remains untrusted until validation."
      }
    };
  }
  const stored = readContextReceiptStore(
    pluginDataRoot,
    repositoryRoot,
    now
  );
  if (stored.ok && stored.found) {
    return {
      receipt: stored.receipt,
      source: {
        status: /** @type {"Known"} */ ("Known"),
        medium: /** @type {"plugin-data"} */ ("plugin-data"),
        diagnostic:
          "A bounded receipt was loaded from validated plugin data."
      }
    };
  }
  return {
    receipt: undefined,
    source: {
      status: /** @type {"Unknown"} */ ("Unknown"),
      medium: /** @type {"unavailable"} */ ("unavailable"),
      diagnostic: stored.ok
        ? stored.diagnostic
        : "Safe plugin-data receipt storage was unavailable."
    }
  };
}
