import path from "node:path";

const DEFAULT_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_STALE_AFTER_MS = 365 * 24 * 60 * 60 * 1_000;
const MAX_FINGERPRINTS = 5_000;
const MAX_OBSERVATIONS = 32;
const MAX_DIAGNOSTICS = 16;
const MAX_SOURCE_PATHS = 16;
const MAX_COMMITS = 8;
const MAX_HANDOFF_BYTES = 2 * 1024 * 1024;
const UNSAFE_TERMINAL_TEXT =
  /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

/**
 * @typedef {"added" | "changed" | "contradicted" | "stale" | "unavailable"}
 *   ObservationCategory
 * @typedef {{
 *   category: ObservationCategory,
 *   claim: string,
 *   path?: string,
 *   trust: "repository-untrusted" | "kanon-generated",
 *   evidence: string[]
 * }} ContinuityObservation
 * @typedef {{
 *   path: string,
 *   mtime_ms: number | null
 * }} ArtifactMetadata
 * @typedef {{
 *   schema: "kanon-continuity-artifact-metadata-v1",
 *   ok: true,
 *   complete: boolean,
 *   values: ArtifactMetadata[]
 * } | {
 *   schema: "kanon-continuity-artifact-metadata-v1",
 *   ok: false,
 *   diagnostic: string,
 *   values: []
 * }} ArtifactMetadataResult
 * @typedef {{
 *   added: ContinuityObservation[],
 *   changed: ContinuityObservation[],
 *   contradicted: ContinuityObservation[],
 *   stale: ContinuityObservation[],
 *   unavailable: ContinuityObservation[]
 * }} ContinuityObservations
 * @typedef {{
 *   path: string,
 *   size: number,
 *   hash_available: boolean,
 *   sha256?: string
 * }} Fingerprint
 * @typedef {{
 *   root: string,
 *   generated_at: string,
 *   fingerprints: Fingerprint[],
 *   fingerprint_complete: boolean,
 *   scan_complete: boolean,
 *   scan_limits: string[],
 *   git: {
 *     found: boolean,
 *     observation_complete: boolean,
 *     branch_available: boolean,
 *     branch?: string,
 *     head_available: boolean,
 *     head?: string,
 *     recent_commits: {
 *       hash: string,
 *       date: string,
 *       subject: string,
 *       trust: "repository-untrusted"
 *     }[]
 *   },
 *   purpose_available: boolean,
 *   purpose?: string,
 *   contradictions: string[]
 * }} NormalizedState
 * @typedef {{
 *   schema: "kanon-continuity-report-v1",
 *   ok: true,
 *   status: "Known",
 *   authority: "live",
 *   read_only: true,
 *   trust: "repository-untrusted",
 *   repository_root: string,
 *   generated_at: string,
 *   sources: {
 *     instructions: {status: "Known" | "Unknown", paths: string[]},
 *     documentation: {status: "Known" | "Unknown", paths: string[]},
 *     artifacts: {status: "Known" | "Unknown", paths: string[]},
 *     recent_artifacts: {status: "Known" | "Unknown", paths: string[]},
 *     checkpoint: {status: "Known" | "Unknown"},
 *     handoff: {status: "Known" | "Unknown"}
 *   },
 *   observations: ContinuityObservations,
 *   recent_commits: {
 *     hash: string,
 *     date: string,
 *     subject: string,
 *     trust: "repository-untrusted"
 *   }[],
 *   diagnostics: string[],
 *   limits: {
 *     max_fingerprints: 5000,
 *     max_observations_per_category: 32,
 *     max_source_paths: 16,
 *     max_recent_commits: 8
 *   }
 * } | {
 *   schema: "kanon-continuity-report-v1",
 *   ok: false,
 *   status: "Unknown",
 *   authority: "live",
 *   read_only: true,
 *   trust: "repository-untrusted",
 *   diagnostic: string,
 *   diagnostics: string[],
 *   observations: ContinuityObservations
 * }} ContinuityReport
 */

/**
 * Adapt already-scanned file metadata into the bounded continuity schema.
 *
 * @param {unknown} inspection
 * @returns {ArtifactMetadataResult}
 */
export function buildContinuityArtifactMetadata(inspection) {
  if (!isRecord(inspection) || !Array.isArray(inspection.files)) {
    return invalidArtifactMetadata(
      "Live artifact timestamps were unavailable or invalid."
    );
  }
  /** @type {ArtifactMetadata[]} */
  const values = [];
  const paths = new Set();
  for (const item of inspection.files.slice(0, MAX_FINGERPRINTS)) {
    if (
      !isRecord(item) ||
      !safeRelativePath(item.path) ||
      paths.has(item.path) ||
      (
        item.mtime_ms !== null &&
        !isNonnegativeSafeInteger(item.mtime_ms)
      )
    ) {
      return invalidArtifactMetadata(
        "Live artifact timestamps were unavailable or invalid."
      );
    }
    paths.add(item.path);
    values.push({
      path: item.path,
      mtime_ms: item.mtime_ms
    });
  }
  return {
    schema: "kanon-continuity-artifact-metadata-v1",
    ok: true,
    complete: inspection.files.length <= MAX_FINGERPRINTS,
    values
  };
}

/**
 * Compare bounded prior continuity claims with authoritative live Kanon state.
 *
 * @param {unknown} input
 * @returns {ContinuityReport}
 */
export function buildContinuityReport(input) {
  if (!isRecord(input) || !allowedInputKeys(input)) {
    return invalidReport("Continuity input is unavailable or invalid.");
  }
  const now = input.now === undefined ? Date.now() : input.now;
  const staleAfter = input.stale_after_ms === undefined
    ? DEFAULT_STALE_AFTER_MS
    : input.stale_after_ms;
  if (
    !isNonnegativeSafeInteger(now) ||
    !isPositiveSafeInteger(staleAfter) ||
    staleAfter > MAX_STALE_AFTER_MS
  ) {
    return invalidReport("Continuity time bounds are unavailable or invalid.");
  }
  const current = normalizeState(input.current, true);
  if (!current.ok) {
    return invalidReport(current.diagnostic);
  }
  /** @type {{available: false} | {available: true, value: NormalizedState}} */
  let previous;
  /** @type {string | undefined} */
  let previousDiagnostic;
  if (input.previous === null || input.previous === undefined) {
    previous = { available: false };
  } else {
    const normalizedPrevious = normalizeState(input.previous, false);
    if (!normalizedPrevious.ok) {
      previous = { available: false };
      previousDiagnostic = normalizedPrevious.diagnostic;
    } else {
      previous = { available: true, value: normalizedPrevious.value };
    }
  }

  /** @type {ContinuityObservations} */
  const observations = {
    added: [],
    changed: [],
    contradicted: [],
    stale: [],
    unavailable: []
  };
  /** @type {string[]} */
  const diagnostics = [];
  const push = createObservationAppender(observations, diagnostics);
  const currentPaths = new Map(
    current.value.fingerprints.map((item) => [item.path, item])
  );
  const liveSourceComplete =
    current.value.scan_complete && current.value.fingerprint_complete;
  const instructionPaths = selectSourcePaths(
    current.value.fingerprints,
    isInstructionPath
  );
  const documentationPaths = selectSourcePaths(
    current.value.fingerprints,
    isDocumentationPath
  );
  const artifactPaths = selectSourcePaths(
    current.value.fingerprints,
    isArtifactPath
  );
  const artifactMetadata = normalizeArtifactMetadata(
    input.artifact_metadata
  );
  const recentArtifacts = selectRecentArtifacts(
    artifactPaths,
    artifactMetadata,
    now,
    staleAfter,
    liveSourceComplete,
    push
  );

  if (!current.value.fingerprint_complete) {
    push(
      "unavailable",
      "The live fingerprint set exceeded the continuity comparison budget."
    );
  }
  if (!current.value.scan_complete) {
    push(
      "unavailable",
      "The live repository scan was incomplete; absence conclusions are unavailable.",
      undefined,
      current.value.scan_limits
    );
  }
  if (!current.value.git.observation_complete) {
    push(
      "unavailable",
      "Live Git evidence was incomplete."
    );
  }
  for (const claim of current.value.contradictions) {
    push("contradicted", claim, undefined, ["live-verification"]);
  }

  /** @type {"Known" | "Unknown"} */
  let checkpointStatus = "Unknown";
  if (!previous.available) {
    push(
      "unavailable",
      previousDiagnostic ||
        "No valid prior Kanon checkpoint was available."
    );
  } else {
    checkpointStatus = "Known";
    const sameRoot = sameCanonicalRoot(
      previous.value.root,
      current.value.root
    );
    if (!sameRoot) {
      push(
        "contradicted",
        "The stored repository root conflicts with the authoritative live root."
      );
    } else {
      compareFingerprints(previous.value, current.value, currentPaths, push);
      compareGit(previous.value, current.value, push);
      comparePurpose(previous.value, current.value, push);
    }
    const generatedAt = Date.parse(previous.value.generated_at);
    if (
      !Number.isFinite(generatedAt) ||
      generatedAt > now + 5 * 60 * 1_000
    ) {
      push(
        "unavailable",
        "The prior checkpoint timestamp was unavailable or invalid."
      );
    } else if (now - generatedAt > staleAfter) {
      push(
        "stale",
        "The prior checkpoint exceeded the configured staleness bound.",
        undefined,
        [previous.value.generated_at]
      );
    }
  }

  const handoff = normalizeHandoff(input.handoff);
  /** @type {"Known" | "Unknown"} */
  let handoffStatus = "Unknown";
  if (handoff.ok && handoff.available) {
    handoffStatus = "Known";
  } else {
    push(
      "unavailable",
      handoff.ok
        ? "No valid prior Kanon handoff was available."
        : handoff.diagnostic
    );
  }
  if (
    input.previous_warning !== undefined &&
    boundedText(input.previous_warning, 1_024)
  ) {
    diagnostics.push(sanitizeText(input.previous_warning, 1_024));
  }

  const sourceStatus = liveSourceComplete ? "Known" : "Unknown";
  return {
    schema: "kanon-continuity-report-v1",
    ok: true,
    status: "Known",
    authority: "live",
    read_only: true,
    trust: "repository-untrusted",
    repository_root: current.value.root,
    generated_at: new Date(now).toISOString(),
    sources: {
      instructions: { status: sourceStatus, paths: instructionPaths },
      documentation: { status: sourceStatus, paths: documentationPaths },
      artifacts: { status: sourceStatus, paths: artifactPaths },
      recent_artifacts: {
        status: recentArtifacts.status,
        paths: recentArtifacts.paths
      },
      checkpoint: { status: checkpointStatus },
      handoff: { status: handoffStatus }
    },
    observations,
    recent_commits: current.value.git.recent_commits.slice(0, MAX_COMMITS),
    diagnostics: Array.from(new Set(diagnostics)).slice(0, MAX_DIAGNOSTICS),
    limits: {
      max_fingerprints: MAX_FINGERPRINTS,
      max_observations_per_category: MAX_OBSERVATIONS,
      max_source_paths: MAX_SOURCE_PATHS,
      max_recent_commits: MAX_COMMITS
    }
  };
}

/**
 * @param {string[]} artifactPaths
 * @param {ReturnType<typeof normalizeArtifactMetadata>} metadata
 * @param {number} now
 * @param {number} recentWindow
 * @param {boolean} liveSourceComplete
 * @param {ReturnType<typeof createObservationAppender>} push
 * @returns {{status: "Known" | "Unknown", paths: string[]}}
 */
function selectRecentArtifacts(
  artifactPaths,
  metadata,
  now,
  recentWindow,
  liveSourceComplete,
  push
) {
  if (artifactPaths.length === 0) {
    return {
      status: liveSourceComplete ? "Known" : "Unknown",
      paths: []
    };
  }
  if (!metadata.ok || !metadata.complete) {
    push(
      "unavailable",
      metadata.ok
        ? "The live artifact timestamp set exceeded the continuity budget."
        : metadata.diagnostic
    );
    return { status: "Unknown", paths: [] };
  }
  const mtimes = new Map(
    metadata.values.map((item) => [item.path, item.mtime_ms])
  );
  /** @type {{path: string, mtime: number}[]} */
  const recent = [];
  let complete = true;
  for (const artifactPath of artifactPaths) {
    const mtime = mtimes.get(artifactPath);
    if (
      mtime === undefined ||
      mtime === null ||
      mtime > now + 5 * 60 * 1_000
    ) {
      complete = false;
      push(
        "unavailable",
        "A live artifact timestamp was unavailable or invalid.",
        artifactPath
      );
      continue;
    }
    if (now - mtime <= recentWindow) {
      recent.push({ path: artifactPath, mtime });
    }
  }
  return {
    status:
      complete && liveSourceComplete
        ? "Known"
        : "Unknown",
    paths: recent
      .sort(
        (left, right) =>
          right.mtime - left.mtime ||
          left.path.localeCompare(right.path)
      )
      .slice(0, MAX_SOURCE_PATHS)
      .map((item) => item.path)
  };
}

/**
 * @param {NormalizedState} previous
 * @param {NormalizedState} current
 * @param {Map<string, Fingerprint>} currentPaths
 * @param {ReturnType<typeof createObservationAppender>} push
 * @returns {void}
 */
function compareFingerprints(previous, current, currentPaths, push) {
  const previousPaths = new Map(
    previous.fingerprints.map((item) => [item.path, item])
  );
  for (const item of current.fingerprints) {
    const before = previousPaths.get(item.path);
    if (!before) {
      push("added", "Live evidence contains a file absent from the checkpoint.", item.path);
    } else if (!before.hash_available || !item.hash_available) {
      push(
        "unavailable",
        "A file fingerprint was unavailable for comparison.",
        item.path
      );
    } else if (before.sha256 !== item.sha256) {
      push("changed", "The live file differs from the checkpoint.", item.path);
    }
  }
  for (const item of previous.fingerprints) {
    if (currentPaths.has(item.path)) {
      continue;
    }
    if (current.scan_complete && current.fingerprint_complete) {
      push(
        "contradicted",
        "A checkpoint file is absent from the complete live scan.",
        item.path
      );
    } else {
      push(
        "unavailable",
        "A checkpoint file was not observed in incomplete live evidence.",
        item.path
      );
    }
  }
}

/**
 * @param {NormalizedState} previous
 * @param {NormalizedState} current
 * @param {ReturnType<typeof createObservationAppender>} push
 * @returns {void}
 */
function compareGit(previous, current, push) {
  if (
    previous.git.head_available &&
    current.git.head_available &&
    previous.git.head !== current.git.head
  ) {
    push(
      "stale",
      "The checkpoint Git HEAD differs from authoritative live Git evidence.",
      undefined,
      ["live-git"]
    );
  } else if (!previous.git.head_available || !current.git.head_available) {
    push("unavailable", "Git HEAD could not be compared.");
  }
  if (
    previous.git.branch_available &&
    current.git.branch_available &&
    previous.git.branch !== current.git.branch
  ) {
    push(
      "stale",
      "The checkpoint branch differs from authoritative live Git evidence.",
      undefined,
      ["live-git"]
    );
  }
}

/**
 * @param {NormalizedState} previous
 * @param {NormalizedState} current
 * @param {ReturnType<typeof createObservationAppender>} push
 * @returns {void}
 */
function comparePurpose(previous, current, push) {
  if (
    previous.purpose_available &&
    current.purpose_available &&
    previous.purpose !== current.purpose
  ) {
    push(
      "contradicted",
      "The stored purpose claim differs from authoritative live analysis.",
      undefined,
      ["live-analysis"]
    );
  }
}

/**
 * @param {unknown} value
 * @param {boolean} current
 * @returns {{
 *   ok: true,
 *   value: NormalizedState
 * } | {
 *   ok: false,
 *   diagnostic: string
 * }}
 */
function normalizeState(value, current) {
  if (
    !isRecord(value) ||
    !isRecord(value.repo) ||
    !safeAbsolutePath(value.repo.root)
  ) {
    return stateFailure(current);
  }
  const generatedAt = boundedText(value.generated_at, 64)
    ? value.generated_at
    : "";
  if (
    (current || value.generated_at !== undefined) &&
    !Number.isFinite(Date.parse(generatedAt))
  ) {
    return stateFailure(current);
  }
  const fingerprints = normalizeFingerprints(value.files);
  if (
    (current || value.files !== undefined) &&
    !fingerprints.ok
  ) {
    return stateFailure(current);
  }
  const scan = normalizeScan(value.scan);
  if (
    (current || value.scan !== undefined) &&
    !scan.ok
  ) {
    return stateFailure(current);
  }
  const git = normalizeGit(value.git);
  if (
    (current || value.git !== undefined) &&
    !git.ok
  ) {
    return stateFailure(current);
  }
  const purpose = normalizePurpose(value.purpose);
  if (!current && value.purpose !== undefined && !purpose.ok) {
    return stateFailure(current);
  }
  const contradictions = normalizeContradictions(value.verification);
  return {
    ok: true,
    value: {
      root: value.repo.root,
      generated_at: generatedAt,
      fingerprints: fingerprints.ok ? fingerprints.values : [],
      fingerprint_complete: fingerprints.ok && fingerprints.complete,
      scan_complete: scan.ok && scan.complete,
      scan_limits: scan.ok ? scan.limits : [],
      git: git.ok ? git.value : unavailableGit(),
      purpose_available: purpose.ok,
      ...(purpose.ok ? { purpose: purpose.value } : {}),
      contradictions
    }
  };
}

/**
 * @param {unknown} files
 * @returns {{
 *   ok: true,
 *   values: Fingerprint[],
 *   complete: boolean
 * } | {ok: false}}
 */
function normalizeFingerprints(files) {
  if (!isRecord(files) || !Array.isArray(files.fingerprints)) {
    return { ok: false };
  }
  /** @type {Fingerprint[]} */
  const values = [];
  const paths = new Set();
  const selected = files.fingerprints.slice(0, MAX_FINGERPRINTS);
  for (const item of selected) {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ["path", "sha256", "size"]) ||
      !safeRelativePath(item.path) ||
      paths.has(item.path) ||
      !isNonnegativeSafeInteger(item.size) ||
      (item.sha256 !== null &&
        (typeof item.sha256 !== "string" ||
          !/^[0-9a-f]{64}$/.test(item.sha256)))
    ) {
      return { ok: false };
    }
    paths.add(item.path);
    values.push({
      path: item.path,
      size: item.size,
      hash_available: item.sha256 !== null,
      ...(typeof item.sha256 === "string" ? { sha256: item.sha256 } : {})
    });
  }
  return {
    ok: true,
    values,
    complete: files.fingerprints.length <= MAX_FINGERPRINTS
  };
}

/**
 * @param {unknown} scan
 * @returns {{ok: true, complete: boolean, limits: string[]} | {ok: false}}
 */
function normalizeScan(scan) {
  if (!isRecord(scan) || typeof scan.complete !== "boolean") {
    return { ok: false };
  }
  const limits = Array.isArray(scan.budgets_reached)
    ? scan.budgets_reached
        .filter((item) => boundedText(item, 64))
        .slice(0, 8)
    : [];
  return { ok: true, complete: scan.complete, limits };
}

/**
 * @param {unknown} git
 * @returns {{ok: true, value: NormalizedState["git"]} | {ok: false}}
 */
function normalizeGit(git) {
  if (
    !isRecord(git) ||
    typeof git.found !== "boolean" ||
    typeof git.observation_complete !== "boolean" ||
    !Array.isArray(git.recent_commits)
  ) {
    return { ok: false };
  }
  /** @type {NormalizedState["git"]["recent_commits"]} */
  const commits = [];
  for (const item of git.recent_commits.slice(0, MAX_COMMITS)) {
    const subject = isRecord(item) && typeof item.subject === "string"
      ? sanitizeText(item.subject, 512)
      : "";
    if (
      !isRecord(item) ||
      typeof item.hash !== "string" ||
      !/^[0-9a-f]{7,64}$/.test(item.hash) ||
      typeof item.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      !Number.isFinite(Date.parse(`${item.date}T00:00:00Z`)) ||
      subject.length === 0
    ) {
      continue;
    }
    commits.push({
      hash: item.hash,
      date: item.date,
      subject,
      trust: "repository-untrusted"
    });
  }
  const branch = safeStructuredText(git.branch, 512)
    ? git.branch
    : undefined;
  const head =
    typeof git.head === "string" && /^[0-9a-f]{7,64}$/.test(git.head)
      ? git.head
      : undefined;
  return {
    ok: true,
    value: {
      found: git.found,
      observation_complete: git.observation_complete,
      branch_available: branch !== undefined,
      ...(branch === undefined ? {} : { branch }),
      head_available: head !== undefined,
      ...(head === undefined ? {} : { head }),
      recent_commits: commits
    }
  };
}

/**
 * @param {unknown} purpose
 * @returns {{ok: true, value: string} | {ok: false}}
 */
function normalizePurpose(purpose) {
  if (!isRecord(purpose) || typeof purpose.claim !== "string") {
    return { ok: false };
  }
  const claim = sanitizeText(purpose.claim, 2_000);
  return claim.length > 0
    ? { ok: true, value: claim }
    : { ok: false };
}

/**
 * @param {unknown} verification
 * @returns {string[]}
 */
function normalizeContradictions(verification) {
  if (!isRecord(verification) || !Array.isArray(verification.issues)) {
    return [];
  }
  return verification.issues
    .filter(
      (item) =>
        isRecord(item) &&
        item.conclusion === "contradiction" &&
        boundedText(item.claim, 1_024)
    )
    .slice(0, MAX_OBSERVATIONS)
    .map((item) => sanitizeText(item.claim, 1_024));
}

/**
 * @param {unknown} handoff
 * @returns {{
 *   ok: true,
 *   available: boolean
 * } | {
 *   ok: false,
 *   diagnostic: string
 * }}
 */
function normalizeHandoff(handoff) {
  if (handoff === undefined) {
    return { ok: true, available: false };
  }
  if (
    !isRecord(handoff) ||
    !hasOnlyKeys(handoff, ["bytes", "found", "status", "valid"]) ||
    typeof handoff.found !== "boolean" ||
    typeof handoff.valid !== "boolean" ||
    !safeStructuredText(handoff.status, 64) ||
    !isNonnegativeSafeInteger(handoff.bytes) ||
    handoff.bytes > MAX_HANDOFF_BYTES
  ) {
    return {
      ok: false,
      diagnostic: "Prior handoff evidence was unavailable or invalid."
    };
  }
  const unavailableStatuses = new Set([
    "budget-exceeded",
    "invalid-options",
    "malformed",
    "outside-root",
    "rejected",
    "unreadable"
  ]);
  const validShape =
    (
      handoff.found === false &&
      handoff.valid === true &&
      handoff.status === "missing" &&
      handoff.bytes === 0
    ) ||
    (
      handoff.found === true &&
      handoff.valid === true &&
      handoff.status === "available"
    ) ||
    (
      handoff.found === true &&
      handoff.valid === false &&
      unavailableStatuses.has(handoff.status)
    );
  if (!validShape) {
    return {
      ok: false,
      diagnostic: "Prior handoff evidence was unavailable or invalid."
    };
  }
  return {
    ok: true,
    available:
      handoff.found &&
      handoff.valid &&
      handoff.status === "available"
  };
}

/**
 * @param {unknown} metadata
 * @returns {{
 *   ok: true,
 *   complete: boolean,
 *   values: ArtifactMetadata[]
 * } | {
 *   ok: false,
 *   diagnostic: string
 * }}
 */
function normalizeArtifactMetadata(metadata) {
  if (metadata === undefined) {
    return {
      ok: false,
      diagnostic: "Live artifact timestamps were unavailable."
    };
  }
  if (
    !isRecord(metadata) ||
    !hasOnlyKeys(
      metadata,
      ["complete", "ok", "schema", "values"]
    ) ||
    metadata.schema !== "kanon-continuity-artifact-metadata-v1" ||
    metadata.ok !== true ||
    typeof metadata.complete !== "boolean" ||
    !Array.isArray(metadata.values) ||
    metadata.values.length > MAX_FINGERPRINTS
  ) {
    return {
      ok: false,
      diagnostic: "Live artifact timestamps were unavailable or invalid."
    };
  }
  /** @type {ArtifactMetadata[]} */
  const values = [];
  const paths = new Set();
  for (const item of metadata.values) {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ["mtime_ms", "path"]) ||
      !safeRelativePath(item.path) ||
      paths.has(item.path) ||
      (
        item.mtime_ms !== null &&
        !isNonnegativeSafeInteger(item.mtime_ms)
      )
    ) {
      return {
        ok: false,
        diagnostic: "Live artifact timestamps were unavailable or invalid."
      };
    }
    paths.add(item.path);
    values.push({
      path: item.path,
      mtime_ms: item.mtime_ms
    });
  }
  return {
    ok: true,
    complete: metadata.complete,
    values
  };
}

/**
 * @param {ContinuityObservations} observations
 * @param {string[]} diagnostics
 * @returns {(
 *   category: ObservationCategory,
 *   claim: string,
 *   path?: string,
 *   evidence?: string[]
 * ) => void}
 */
function createObservationAppender(observations, diagnostics) {
  return (category, claim, selectedPath, evidence = []) => {
    const target = observations[category];
    if (target.length >= MAX_OBSERVATIONS) {
      diagnostics.push(`The ${category} observation limit was reached.`);
      return;
    }
    target.push({
      category,
      claim: sanitizeText(claim, 1_024),
      ...(selectedPath === undefined ? {} : { path: selectedPath }),
      trust: selectedPath === undefined
        ? "kanon-generated"
        : "repository-untrusted",
      evidence: evidence
        .filter((item) => boundedText(item, 256))
        .slice(0, 8)
        .map((item) => sanitizeText(item, 256))
    });
  };
}

/**
 * @param {Fingerprint[]} fingerprints
 * @param {(path: string) => boolean} predicate
 * @returns {string[]}
 */
function selectSourcePaths(fingerprints, predicate) {
  return fingerprints
    .map((item) => item.path)
    .filter(predicate)
    .sort((left, right) =>
      left.split("/").length - right.split("/").length ||
      left.localeCompare(right)
    )
    .slice(0, MAX_SOURCE_PATHS);
}

/**
 * @param {string} selectedPath
 * @returns {boolean}
 */
function isInstructionPath(selectedPath) {
  const basename = path.posix.basename(selectedPath).toLowerCase();
  return (
    basename === "agents.md" ||
    basename === "claude.md" ||
    basename === "contributing.md" ||
    selectedPath.toLowerCase() === ".github/copilot-instructions.md"
  );
}

/**
 * @param {string} selectedPath
 * @returns {boolean}
 */
function isDocumentationPath(selectedPath) {
  const lower = selectedPath.toLowerCase();
  const basename = path.posix.basename(lower);
  return (
    basename.startsWith("readme") ||
    lower === "docs/architecture.md" ||
    lower === "docs/continuity.md" ||
    lower === "docs/session-log.md" ||
    lower === "docs/next.md" ||
    lower.startsWith("docs/adr/") ||
    lower.startsWith("adr/")
  );
}

/**
 * @param {string} selectedPath
 * @returns {boolean}
 */
function isArtifactPath(selectedPath) {
  return /^(?:reports|briefings|evals\/reports|sample_outputs)\//i.test(
    selectedPath
  );
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function sameCanonicalRoot(left, right) {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * @param {Record<string, unknown>} value
 * @param {string[]} allowed
 * @returns {boolean}
 */
function hasOnlyKeys(value, allowed) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

/**
 * @param {Record<string, unknown>} input
 * @returns {boolean}
 */
function allowedInputKeys(input) {
  const allowed = new Set([
    "artifact_metadata",
    "current",
    "handoff",
    "now",
    "previous",
    "previous_warning",
    "stale_after_ms"
  ]);
  return (
    Object.hasOwn(input, "current") &&
    Object.keys(input).every((key) => allowed.has(key)) &&
    (input.previous_warning === undefined ||
      boundedText(input.previous_warning, 1_024))
  );
}

/**
 * @param {string} diagnostic
 * @returns {ArtifactMetadataResult}
 */
function invalidArtifactMetadata(diagnostic) {
  return {
    schema: "kanon-continuity-artifact-metadata-v1",
    ok: false,
    diagnostic,
    values: []
  };
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isNonnegativeSafeInteger(value) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isPositiveSafeInteger(value) {
  return isNonnegativeSafeInteger(value) && value > 0;
}

/**
 * @param {unknown} value
 * @param {number} maximum
 * @returns {value is string}
 */
function boundedText(value, maximum) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum
  );
}

/**
 * @param {unknown} value
 * @param {number} maximum
 * @returns {value is string}
 */
function safeStructuredText(value, maximum) {
  return boundedText(value, maximum) && !UNSAFE_TERMINAL_TEXT.test(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function safeAbsolutePath(value) {
  return (
    safeStructuredText(value, 8_192) &&
    path.isAbsolute(value) &&
    path.normalize(value) === value
  );
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function safeRelativePath(value) {
  return (
    safeStructuredText(value, 4_096) &&
    !path.posix.isAbsolute(value) &&
    value !== "." &&
    !value.includes("\\") &&
    path.posix.normalize(value) === value &&
    value.split("/").every((part) => part !== "." && part !== "..")
  );
}

/**
 * @param {string} value
 * @param {number} maximum
 * @returns {string}
 */
function sanitizeText(value, maximum) {
  return value
    .normalize("NFKC")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

/**
 * @param {boolean} current
 * @returns {{ok: false, diagnostic: string}}
 */
function stateFailure(current) {
  return {
    ok: false,
    diagnostic: current
      ? "Live continuity state is unavailable or invalid."
      : "Prior continuity state is unavailable or invalid."
  };
}

/**
 * @returns {NormalizedState["git"]}
 */
function unavailableGit() {
  return {
    found: false,
    observation_complete: false,
    branch_available: false,
    head_available: false,
    recent_commits: []
  };
}

/**
 * @param {string} diagnostic
 * @returns {ContinuityReport}
 */
function invalidReport(diagnostic) {
  return {
    schema: "kanon-continuity-report-v1",
    ok: false,
    status: "Unknown",
    authority: "live",
    read_only: true,
    trust: "repository-untrusted",
    diagnostic,
    diagnostics: [],
    observations: {
      added: [],
      changed: [],
      contradicted: [],
      stale: [],
      unavailable: []
    }
  };
}
