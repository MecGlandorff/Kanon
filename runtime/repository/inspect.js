import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  boundedDiagnostics,
  isBoundedString,
  repositoryIdentifier,
  repositoryValue,
  sanitizeDisplayText
} from "../core/trust.js";
import { observeRepositoryGit } from "./git.js";
import {
  canonicalizeRepositoryRoot,
  isSafeRelativePath,
  isSensitiveRepositoryPath,
  readBoundedRepositoryFile,
  resolveRepositoryPath
} from "./read.js";

const MAX_FILES = 2_500;
const MAX_ENTRIES = 10_000;
const MAX_FILE_BYTES = 750_000;
const MAX_HASH_BYTES = 32 * 1024 * 1024;
const MAX_SCAN_MS = 5_000;
const MAX_IGNORE_BYTES = 128 * 1024;
const MAX_IGNORE_RULES = 256;
const MAX_EVIDENCE_ITEMS = 12;
const MAX_INSTRUCTION_ITEMS = 8;
const MAX_EVIDENCE_BYTES = 64 * 1024;
const MAX_EXCERPT_BYTES = 8 * 1024;
const MAX_DIAGNOSTIC_PATHS = 16;
const FIXED_EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".kanon",
  "node_modules",
  "coverage",
  ".nyc_output",
  "dist"
]);
const TEXT_EXTENSIONS = new Set([
  "",
  ".c",
  ".cc",
  ".cfg",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".md",
  ".mjs",
  ".mts",
  ".php",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml"
]);
const INSTRUCTION_NAMES = Object.freeze([
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  ".github/copilot-instructions.md"
]);
const BASELINE_PATHS = new Map([
  ["README.md", 100],
  ["README", 98],
  ["package.json", 96],
  ["pyproject.toml", 94],
  ["Cargo.toml", 94],
  ["go.mod", 94],
  ["Makefile", 90],
  ["CHANGELOG.md", 72],
  ["RELEASING.md", 72]
]);

/**
 * @typedef {"orient" | "resume" | "verify"} InspectionProfile
 * @typedef {{
 *   path: string,
 *   size: number,
 *   mtime_ms: number | null,
 *   text: boolean,
 *   sha256: string | null
 * }} InspectedFile
 * @typedef {{
 *   kind: "instruction" | "documentation" | "metadata" | "source" | "validation" | "artifact",
 *   path: string,
 *   size: number,
 *   sha256: string,
 *   content: string,
 *   truncated: boolean,
 *   trust: "repository-untrusted"
 * }} RepositoryEvidence
 * @typedef {{
 *   complete: boolean,
 *   instruction_complete: boolean,
 *   entries_visited: number,
 *   files_observed: number,
 *   fixed_directories_excluded: number,
 *   ignore_entries_excluded: number,
 *   sensitive_files_excluded: number,
 *   rejected_paths: number,
 *   unreadable_paths: number,
 *   rejected_path_samples: string[],
 *   unreadable_path_samples: string[],
 *   budgets_reached: string[],
 *   diagnostics: string[],
 *   limits: {
 *     max_files: number,
 *     max_entries: number,
 *     max_file_bytes: number,
 *     max_hash_bytes: number,
 *     max_scan_ms: number,
 *     max_evidence_items: number,
 *     max_evidence_bytes: number
 *   }
 * }} InspectionCoverage
 * @typedef {{
 *   schema: "kanon-repository-inspection-v1",
 *   ok: true,
 *   status: "Known",
 *   root: string,
 *   task: string,
 *   profile: InspectionProfile,
 *   instructions: RepositoryEvidence[],
 *   evidence: RepositoryEvidence[],
 *   files: InspectedFile[],
 *   git: import("./git.js").GitObservation,
 *   coverage: InspectionCoverage,
 *   evidence_fingerprint: string,
 *   evidence_complete: boolean,
 *   current_state: Record<string, unknown>,
 *   trust: "repository-untrusted"
 * } | {
 *   schema: "kanon-repository-inspection-v1",
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string,
 *   diagnostics: string[],
 *   trust: "repository-untrusted"
 * }} RepositoryInspection
 * @typedef {{
 *   profile?: InspectionProfile,
 *   target?: string,
 *   git_runner?: import("./git.js").GitRunner
 * }} InspectOptions
 * @typedef {{
 *   previous: unknown | null,
 *   previous_warning: string | null,
 *   handoff: {
 *     found: boolean,
 *     valid: boolean,
 *     status: string,
 *     bytes: number
 *   },
 *   handoff_warning: string | null
 * }} PersistedContinuity
 */

/**
 * Inspect a repository in a fixed order: canonical root, applicable
 * instructions, bounded metadata scan, bounded Git observation, then selected
 * evidence reads.
 *
 * @param {unknown} rootInput
 * @param {unknown} taskInput
 * @param {InspectOptions} [options]
 * @returns {RepositoryInspection}
 */
export function inspectRepository(rootInput, taskInput, options = {}) {
  const profile = options.profile || "orient";
  if (
    !["orient", "resume", "verify"].includes(profile) ||
    !isBoundedString(taskInput, 2_048)
  ) {
    return invalidInspection(
      "Repository inspection input was unavailable or invalid."
    );
  }
  const task = sanitizeDisplayText(taskInput, 2_048);
  if (!task) {
    return invalidInspection(
      "Repository inspection task was unavailable or invalid."
    );
  }
  const root = canonicalizeRepositoryRoot(rootInput);
  if (!root.ok) {
    return invalidInspection(root.diagnostic);
  }

  const coverage = createCoverage();
  const explicitPaths = extractTaskPaths(task);

  // Applicable repository instructions are the first repository file content
  // read after canonicalization.
  const instructions = readApplicableInstructions(
    root.root,
    explicitPaths,
    coverage
  );
  const scan = scanRepository(root.root, coverage);
  const git = observeRepositoryGit(root.root, {
    ...(options.git_runner === undefined
      ? {}
      : { runner: options.git_runner })
  });
  const target =
    options.target !== undefined && isSafeRelativePath(options.target)
      ? options.target.replaceAll("\\", "/")
      : undefined;
  const selected = selectEvidencePaths(
    scan.files,
    instructions.map((item) => item.path),
    task,
    explicitPaths,
    profile,
    target
  );
  const receiptPaths = selectEvidencePaths(
    scan.files,
    instructions.map((item) => item.path),
    task,
    explicitPaths,
    "orient",
    undefined
  );
  const evidence = [
    ...instructions,
    ...readSelectedEvidence(
      root.root,
      scan.files,
      selected,
      instructions,
      coverage
    )
  ].slice(0, MAX_EVIDENCE_ITEMS);
  finishCoverage(coverage, scan.files.length, git);
  const evidenceFingerprint = fingerprintEvidence(
    root.root,
    task,
    instructions,
    receiptPaths,
    scan.files,
    coverage,
    git
  );
  return {
    schema: "kanon-repository-inspection-v1",
    ok: true,
    status: "Known",
    root: root.root,
    task,
    profile,
    instructions,
    evidence,
    files: scan.files,
    git,
    coverage,
    evidence_fingerprint: evidenceFingerprint,
    evidence_complete:
      coverage.complete && git.observation_complete,
    current_state: buildContinuityState(
      root.root,
      evidence,
      scan.files,
      coverage,
      git
    ),
    trust: "repository-untrusted"
  };
}

/**
 * Read only the existing v0.4 continuity checkpoint and handoff metadata.
 * Missing state is ordinary Unknown input, while malformed or unsafe state is
 * diagnosed and discarded.
 *
 * @param {string} canonicalRoot
 * @returns {PersistedContinuity}
 */
export function inspectPersistedContinuity(canonicalRoot) {
  const previousRead = readBoundedRepositoryFile(
    canonicalRoot,
    ".kanon/STATE.json",
    2 * 1024 * 1024
  );
  /** @type {unknown | null} */
  let previous = null;
  /** @type {string | null} */
  let previousWarning = null;
  if (previousRead.ok) {
    try {
      previous = JSON.parse(previousRead.bytes.toString("utf8"));
    } catch {
      previousWarning =
        "Prior continuity state was malformed and was ignored.";
    }
  } else if (previousRead.status !== "missing") {
    previousWarning =
      "Prior continuity state was unavailable or unsafe and was ignored.";
  }

  const handoffRead = readBoundedRepositoryFile(
    canonicalRoot,
    ".kanon/HANDOFF.md",
    2 * 1024 * 1024
  );
  if (handoffRead.ok) {
    return {
      previous,
      previous_warning: previousWarning,
      handoff: {
        found: true,
        valid: true,
        status: "available",
        bytes: handoffRead.size
      },
      handoff_warning: null
    };
  }
  if (handoffRead.status === "missing") {
    return {
      previous,
      previous_warning: previousWarning,
      handoff: {
        found: false,
        valid: true,
        status: "missing",
        bytes: 0
      },
      handoff_warning: null
    };
  }
  return {
    previous,
    previous_warning: previousWarning,
    handoff: {
      found: true,
      valid: false,
      status:
        handoffRead.status === "oversized"
          ? "budget-exceeded"
          : handoffRead.status,
      bytes: 0
    },
    handoff_warning:
      "Prior handoff evidence was unavailable or unsafe and was ignored."
  };
}

/**
 * @param {RepositoryInspection} inspection
 * @returns {{
 *   repository: {
 *     root: import("../core/trust.js").RepositoryValue
 *   },
 *   task: string,
 *   instructions: {
 *     status: "Known" | "Unknown",
 *     values: ReturnType<typeof publicEvidence>[]
 *   },
 *   git: {
 *     status: "Known" | "Unknown",
 *     branch: import("../core/trust.js").RepositoryValue | null,
 *     head: import("../core/trust.js").RepositoryValue | null,
 *     dirty: boolean | null,
 *     change_count: number | null,
 *     recent_commits: {
 *       hash: import("../core/trust.js").RepositoryValue,
 *       date: import("../core/trust.js").RepositoryValue,
 *       subject: import("../core/trust.js").RepositoryValue
 *     }[]
 *   },
 *   evidence: ReturnType<typeof publicEvidence>[],
 *   coverage: ReturnType<typeof publicCoverage>
 * } | null}
 */
export function publicInspection(inspection) {
  if (!inspection.ok) {
    return null;
  }
  return {
    repository: {
      root: repositoryIdentifier(inspection.root, 8_192)
    },
    task: inspection.task,
    instructions: {
      status: inspection.coverage.instruction_complete
        ? "Known"
        : "Unknown",
      values: inspection.instructions.map(publicEvidence)
    },
    git: {
      status: inspection.git.observation_complete ? "Known" : "Unknown",
      branch:
        inspection.git.branch === null
          ? null
          : repositoryIdentifier(inspection.git.branch, 512),
      head:
        inspection.git.head === null
          ? null
          : repositoryIdentifier(inspection.git.head, 128),
      dirty: inspection.git.dirty,
      change_count: inspection.git.change_count,
      recent_commits: inspection.git.recent_commits.map((commit) => ({
        hash: repositoryIdentifier(commit.hash, 128),
        date: repositoryIdentifier(commit.date, 32),
        subject: repositoryValue(commit.subject, 512)
      }))
    },
    evidence: inspection.evidence.map(publicEvidence),
    coverage: publicCoverage(inspection.coverage)
  };
}

/**
 * @param {string} root
 * @param {string[]} explicitPaths
 * @param {InspectionCoverage} coverage
 * @returns {RepositoryEvidence[]}
 */
function readApplicableInstructions(root, explicitPaths, coverage) {
  const candidates = new Set(INSTRUCTION_NAMES);
  for (const selectedPath of explicitPaths) {
    let directory = path.posix.dirname(selectedPath);
    while (directory !== "." && directory !== "/") {
      candidates.add(`${directory}/AGENTS.md`);
      candidates.add(`${directory}/CLAUDE.md`);
      const parent = path.posix.dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
  }
  if (candidates.size > 32) {
    coverage.instruction_complete = false;
    noteBudget(coverage, "max_instruction_candidates");
  }
  /** @type {RepositoryEvidence[]} */
  const instructions = [];
  for (const candidate of Array.from(candidates).slice(0, 32)) {
    if (instructions.length >= MAX_INSTRUCTION_ITEMS) {
      coverage.instruction_complete = false;
      noteBudget(coverage, "max_instruction_items");
      break;
    }
    const read = readBoundedRepositoryFile(
      root,
      candidate,
      MAX_EXCERPT_BYTES,
      { truncate: true }
    );
    if (!read.ok) {
      if (read.status !== "missing") {
        coverage.instruction_complete = false;
        recordReadFailure(coverage, read);
      }
      continue;
    }
    const rawContent = read.bytes.toString("utf8");
    const sanitizationTruncated =
      Buffer.byteLength(rawContent, "utf8") > MAX_EXCERPT_BYTES;
    const content = sanitizeDisplayText(
      rawContent,
      MAX_EXCERPT_BYTES,
      { multiline: true }
    );
    instructions.push({
      kind: "instruction",
      path: read.relative_path,
      size: read.size,
      sha256: sha256(read.bytes),
      content,
      truncated: read.truncated || sanitizationTruncated,
      trust: "repository-untrusted"
    });
    if (read.truncated || sanitizationTruncated) {
      coverage.instruction_complete = false;
      noteBudget(coverage, "instruction_truncated");
    }
  }
  return instructions;
}

/**
 * @param {string} root
 * @param {InspectionCoverage} coverage
 * @returns {{files: InspectedFile[]}}
 */
function scanRepository(root, coverage) {
  const ignoreRules = loadIgnoreRules(root, coverage);
  /** @type {{absolute: string, relative: string}[]} */
  const pending = [{ absolute: root, relative: "" }];
  /** @type {InspectedFile[]} */
  const files = [];
  const started = Date.now();
  const deadline = started + MAX_SCAN_MS;
  let hashedBytes = 0;
  while (pending.length > 0 && !terminalBudgetReached(coverage)) {
    if (Date.now() > deadline) {
      noteBudget(coverage, "max_scan_ms");
      break;
    }
    const directory = pending.pop();
    if (!directory) {
      break;
    }
    const read = readBoundedDirectory(
      directory.absolute,
      MAX_ENTRIES - coverage.entries_visited,
      deadline
    );
    if (!read.ok) {
      coverage.unreadable_paths += 1;
      samplePath(
        coverage.unreadable_path_samples,
        directory.relative || "."
      );
      continue;
    }
    const entries = read.entries;
    if (read.truncated) {
      noteBudget(coverage, "max_entries");
    }
    if (read.timed_out) {
      noteBudget(coverage, "max_scan_ms");
    }
    entries.sort((left, right) => compareText(left.name, right.name));
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (!entry) {
        continue;
      }
      coverage.entries_visited += 1;
      if (coverage.entries_visited > MAX_ENTRIES) {
        noteBudget(coverage, "max_entries");
        break;
      }
      const relative = directory.relative
        ? `${directory.relative}/${entry.name}`
        : entry.name;
      if (!isSafeRelativePath(relative)) {
        coverage.rejected_paths += 1;
        samplePath(coverage.rejected_path_samples, relative);
        continue;
      }
      if (entry.isSymbolicLink()) {
        coverage.rejected_paths += 1;
        samplePath(coverage.rejected_path_samples, relative);
        continue;
      }
      if (entry.isDirectory()) {
        if (FIXED_EXCLUDED_DIRECTORIES.has(entry.name)) {
          coverage.fixed_directories_excluded += 1;
          continue;
        }
        if (matchesIgnore(relative, true, ignoreRules)) {
          coverage.ignore_entries_excluded += 1;
          continue;
        }
        const selected = resolveRepositoryPath(root, relative, "directory");
        if (!selected.ok) {
          recordPathFailure(coverage, selected);
          continue;
        }
        pending.push({ absolute: selected.path, relative });
        continue;
      }
      if (!entry.isFile()) {
        coverage.rejected_paths += 1;
        samplePath(coverage.rejected_path_samples, relative);
        continue;
      }
      if (matchesIgnore(relative, false, ignoreRules)) {
        coverage.ignore_entries_excluded += 1;
        continue;
      }
      if (isSensitiveRepositoryPath(relative)) {
        coverage.sensitive_files_excluded += 1;
        continue;
      }
      if (files.length >= MAX_FILES) {
        noteBudget(coverage, "max_files");
        break;
      }
      const selected = resolveRepositoryPath(root, relative, "file");
      if (!selected.ok) {
        recordPathFailure(coverage, selected);
        continue;
      }
      let digest = null;
      let text = isTextPath(relative);
      let observedSize = selected.stat.size;
      let observedMtime =
        Number.isFinite(selected.stat.mtimeMs) &&
        selected.stat.mtimeMs >= 0
          ? Math.floor(selected.stat.mtimeMs)
          : null;
      if (selected.stat.size > MAX_FILE_BYTES) {
        noteNonterminalBudget(coverage, "max_file_bytes");
      } else if (hashedBytes + selected.stat.size > MAX_HASH_BYTES) {
        noteNonterminalBudget(coverage, "max_hash_bytes");
      } else {
        const read = readBoundedRepositoryFile(
          root,
          relative,
          MAX_FILE_BYTES
        );
        if (read.ok) {
          digest = sha256(read.bytes);
          hashedBytes += read.bytes.length;
          observedSize = read.size;
          observedMtime = read.mtime_ms;
          if (read.bytes.subarray(0, 8_192).includes(0)) {
            text = false;
          }
        } else {
          recordReadFailure(coverage, read);
        }
      }
      files.push({
        path: relative,
        size: observedSize,
        mtime_ms: observedMtime,
        text,
        sha256: digest
      });
    }
  }
  files.sort((left, right) => compareText(left.path, right.path));
  return { files };
}

/**
 * Read at most the remaining global entry budget plus one sentinel. Directory
 * enumeration therefore cannot allocate in proportion to an unbounded
 * repository-controlled directory.
 *
 * @param {string} directory
 * @param {number} maximumEntries
 * @param {number} deadline
 * @returns {{
 *   ok: true,
 *   entries: import("node:fs").Dirent[],
 *   truncated: boolean,
 *   timed_out: boolean
 * } | {
 *   ok: false
 * }}
 */
function readBoundedDirectory(directory, maximumEntries, deadline) {
  if (
    !Number.isSafeInteger(maximumEntries) ||
    maximumEntries < 1
  ) {
    return {
      ok: true,
      entries: [],
      truncated: true,
      timed_out: false
    };
  }
  /** @type {import("node:fs").Dir | undefined} */
  let handle;
  try {
    handle = fs.opendirSync(directory);
    /** @type {import("node:fs").Dirent[]} */
    const entries = [];
    let truncated = false;
    let timedOut = false;
    while (entries.length <= maximumEntries) {
      if (Date.now() > deadline) {
        timedOut = true;
        break;
      }
      const entry = handle.readSync();
      if (entry === null) {
        break;
      }
      if (entries.length === maximumEntries) {
        truncated = true;
        break;
      }
      entries.push(entry);
    }
    handle.closeSync();
    handle = undefined;
    return {
      ok: true,
      entries,
      truncated,
      timed_out: timedOut
    };
  } catch {
    if (handle !== undefined) {
      try {
        handle.closeSync();
      } catch {
        // Best-effort closure of this process's directory descriptor.
      }
    }
    return { ok: false };
  }
}

/**
 * @param {string} root
 * @param {InspectionCoverage} coverage
 * @returns {RegExp[]}
 */
function loadIgnoreRules(root, coverage) {
  const read = readBoundedRepositoryFile(
    root,
    ".kanonignore",
    MAX_IGNORE_BYTES
  );
  if (!read.ok) {
    if (read.status !== "missing") {
      recordReadFailure(coverage, read);
      coverage.diagnostics.push(
        "The repository ignore file was unavailable; only fixed exclusions were used."
      );
    }
    return [];
  }
  const lines = read.bytes.toString("utf8").split(/\r?\n/);
  /** @type {RegExp[]} */
  const rules = [];
  for (const line of lines) {
    const selected = line.trim();
    if (!selected || selected.startsWith("#")) {
      continue;
    }
    if (
      rules.length >= MAX_IGNORE_RULES ||
      selected.startsWith("!") ||
      selected.includes("..") ||
      path.isAbsolute(selected) ||
      selected.length > 512
    ) {
      coverage.diagnostics.push(
        "One or more repository ignore rules were invalid or exceeded the rule budget."
      );
      noteNonterminalBudget(coverage, "max_ignore_rules");
      continue;
    }
    rules.push(ignoreRule(selected));
  }
  return rules;
}

/**
 * @param {string} rule
 * @returns {RegExp}
 */
function ignoreRule(rule) {
  const normalized = rule.replaceAll("\\", "/").replace(/^\/+/, "");
  const directory = normalized.endsWith("/");
  const body = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, ".*");
  const anchored = normalized.includes("/")
    ? `^${body}`
    : `(?:^|/)${body}`;
  return new RegExp(`${anchored}${directory ? "(?:/|$)" : "$"}`);
}

/**
 * @param {string} relative
 * @param {boolean} directory
 * @param {RegExp[]} rules
 * @returns {boolean}
 */
function matchesIgnore(relative, directory, rules) {
  const candidate = directory ? `${relative}/` : relative;
  return rules.some((rule) => rule.test(candidate));
}

/**
 * @param {InspectedFile[]} files
 * @param {string[]} instructionPaths
 * @param {string} task
 * @param {string[]} explicitPaths
 * @param {InspectionProfile} profile
 * @param {string | undefined} target
 * @returns {string[]}
 */
function selectEvidencePaths(
  files,
  instructionPaths,
  task,
  explicitPaths,
  profile,
  target
) {
  const instructionSet = new Set(instructionPaths);
  const taskTokens = tokens(task);
  /** @type {{path: string, score: number}[]} */
  const ranked = [];
  for (const file of files) {
    if (!file.text || instructionSet.has(file.path)) {
      continue;
    }
    let score = BASELINE_PATHS.get(file.path) || 0;
    if (explicitPaths.includes(file.path) || file.path === target) {
      score += 1_000;
    }
    const lower = file.path.toLowerCase();
    for (const token of taskTokens) {
      if (lower.includes(token)) {
        score += token.length >= 6 ? 36 : 18;
      }
    }
    if (profile === "resume") {
      if (isDocumentationPath(file.path)) score += 70;
      if (isArtifactPath(file.path)) score += 55;
    }
    if (profile === "verify") {
      if (isVerificationPath(file.path)) score += 120;
      if (isGeneratedPairPath(file.path)) score += 60;
    }
    if (score > 0) {
      ranked.push({ path: file.path, score });
    }
  }
  return ranked
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.path.split("/").length - right.path.split("/").length ||
        compareText(left.path, right.path)
    )
    .slice(0, Math.max(0, MAX_EVIDENCE_ITEMS - instructionPaths.length))
    .map((item) => item.path);
}

/**
 * @param {string} root
 * @param {InspectedFile[]} files
 * @param {string[]} selectedPaths
 * @param {RepositoryEvidence[]} instructions
 * @param {InspectionCoverage} coverage
 * @returns {RepositoryEvidence[]}
 */
function readSelectedEvidence(
  root,
  files,
  selectedPaths,
  instructions,
  coverage
) {
  const instructionPaths = new Set(instructions.map((item) => item.path));
  const byPath = new Map(files.map((file) => [file.path, file]));
  /** @type {RepositoryEvidence[]} */
  const evidence = [];
  let retainedBytes = instructions.reduce(
    (total, item) => total + Buffer.byteLength(item.content),
    0
  );
  for (const selectedPath of selectedPaths) {
    if (instructionPaths.has(selectedPath)) {
      continue;
    }
    const file = byPath.get(selectedPath);
    if (!file) {
      continue;
    }
    const remaining = MAX_EVIDENCE_BYTES - retainedBytes;
    if (remaining < 1) {
      noteBudget(coverage, "max_evidence_bytes");
      break;
    }
    const maximum = Math.min(MAX_EXCERPT_BYTES, remaining);
    const read = readBoundedRepositoryFile(
      root,
      selectedPath,
      maximum,
      { truncate: true }
    );
    if (!read.ok) {
      recordReadFailure(coverage, read);
      continue;
    }
    if (
      read.size !== file.size ||
      read.mtime_ms !== file.mtime_ms
    ) {
      coverage.unreadable_paths += 1;
      samplePath(coverage.unreadable_path_samples, selectedPath);
      coverage.diagnostics.push(
        "A selected evidence file changed between the repository scan and its bounded evidence read."
      );
      continue;
    }
    const rawContent = read.bytes.toString("utf8");
    const sanitizationTruncated =
      Buffer.byteLength(rawContent, "utf8") > maximum;
    const content = sanitizeDisplayText(
      rawContent,
      maximum,
      { multiline: true }
    );
    retainedBytes += Buffer.byteLength(content, "utf8");
    evidence.push({
      kind: evidenceKind(selectedPath),
      path: selectedPath,
      size: read.size,
      sha256: file.sha256 || sha256(read.bytes),
      content,
      truncated: read.truncated || sanitizationTruncated,
      trust: "repository-untrusted"
    });
    if (read.truncated || sanitizationTruncated) {
      noteNonterminalBudget(coverage, "evidence_truncated");
    }
  }
  return evidence;
}

/**
 * @param {string} root
 * @param {string} task
 * @param {RepositoryEvidence[]} instructions
 * @param {string[]} selectedPaths
 * @param {InspectedFile[]} files
 * @param {InspectionCoverage} coverage
 * @param {import("./git.js").GitObservation} git
 * @returns {string}
 */
function fingerprintEvidence(
  root,
  task,
  instructions,
  selectedPaths,
  files,
  coverage,
  git
) {
  const selected = new Set(selectedPaths);
  const stable = {
    root,
    task,
    evidence: [
      ...instructions.map((item) => ({
        kind: item.kind,
        path: item.path,
        size: item.size,
        sha256: item.sha256,
        truncated: item.truncated
      })),
      ...files
        .filter((file) => selected.has(file.path))
        .map((file) => ({
          kind: evidenceKind(file.path),
          path: file.path,
          size: file.size,
          sha256: file.sha256,
          truncated: file.sha256 === null
        }))
    ].map((item) => ({
      kind: item.kind,
      path: item.path,
      size: item.size,
      sha256: item.sha256,
      truncated: item.truncated
    })),
    coverage: {
      complete: coverage.complete,
      instruction_complete: coverage.instruction_complete,
      entries_visited: coverage.entries_visited,
      files_observed: coverage.files_observed,
      fixed_directories_excluded: coverage.fixed_directories_excluded,
      ignore_entries_excluded: coverage.ignore_entries_excluded,
      sensitive_files_excluded: coverage.sensitive_files_excluded,
      rejected_paths: coverage.rejected_paths,
      unreadable_paths: coverage.unreadable_paths,
      rejected_path_samples: coverage.rejected_path_samples,
      unreadable_path_samples: coverage.unreadable_path_samples,
      budgets_reached: coverage.budgets_reached
    },
    git: {
      found: git.found,
      branch: git.branch,
      head: git.head,
      dirty: git.dirty,
      change_count: git.change_count,
      change_count_exact: git.change_count_exact,
      changes: git.changes.map((change) => ({
        path: change.path,
        index: change.index,
        worktree: change.worktree
      })),
      changes_truncated: git.changes_truncated,
      sensitive_changes_skipped: git.sensitive_changes_skipped,
      recent_commits: git.recent_commits.map((commit) => ({
        hash: commit.hash,
        date: commit.date,
        subject: commit.subject
      })),
      observation_complete: git.observation_complete
    }
  };
  return sha256(Buffer.from(JSON.stringify(stable), "utf8"));
}

/**
 * @param {string} root
 * @param {RepositoryEvidence[]} evidence
 * @param {InspectedFile[]} files
 * @param {InspectionCoverage} coverage
 * @param {import("./git.js").GitObservation} git
 * @returns {Record<string, unknown>}
 */
function buildContinuityState(root, evidence, files, coverage, git) {
  const purpose = purposeClaim(evidence);
  return {
    repo: { root },
    generated_at: new Date().toISOString(),
    files: {
      fingerprints: files.map((file) => ({
        path: file.path,
        size: file.size,
        sha256: file.sha256
      }))
    },
    scan: {
      complete: coverage.complete,
      budgets_reached: coverage.budgets_reached
    },
    git,
    ...(purpose === null ? {} : { purpose: { claim: purpose } }),
    verification: { issues: [] }
  };
}

/**
 * @param {RepositoryEvidence[]} evidence
 * @returns {string | null}
 */
function purposeClaim(evidence) {
  const packageEvidence = evidence.find((item) => item.path === "package.json");
  if (packageEvidence) {
    try {
      const parsed = JSON.parse(packageEvidence.content);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        "description" in parsed &&
        typeof parsed.description === "string"
      ) {
        const description = sanitizeDisplayText(parsed.description, 2_000);
        if (description) {
          return description;
        }
      }
    } catch {
      // A malformed package is not purpose evidence.
    }
  }
  const readme = evidence.find((item) =>
    path.posix.basename(item.path).toLowerCase().startsWith("readme")
  );
  if (!readme) {
    return null;
  }
  const heading = readme.content
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  return heading ? sanitizeDisplayText(heading, 2_000) : null;
}

/**
 * @param {unknown} task
 * @returns {string[]}
 */
function extractTaskPaths(task) {
  if (typeof task !== "string") {
    return [];
  }
  const matches = task.match(/[A-Za-z0-9_.@/-]+(?:\.[A-Za-z0-9_-]+|\/)/g) || [];
  return Array.from(
    new Set(
      matches
        .map((value) => value.replace(/[),.:;]+$/, "").replace(/\/$/, ""))
        .filter((value) => isSafeRelativePath(value))
        .slice(0, 16)
    )
  );
}

/**
 * @param {string} task
 * @returns {string[]}
 */
function tokens(task) {
  const stop = new Set([
    "about",
    "after",
    "before",
    "check",
    "code",
    "from",
    "into",
    "only",
    "repository",
    "task",
    "that",
    "the",
    "this",
    "with"
  ]);
  return Array.from(
    new Set(
      task
        .toLowerCase()
        .split(/[^a-z0-9_.-]+/)
        .filter((value) => value.length >= 3 && !stop.has(value))
    )
  ).slice(0, 24);
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function isTextPath(relativePath) {
  const basename = path.posix.basename(relativePath);
  const extension = path.posix.extname(basename).toLowerCase();
  return (
    (
      !basename.startsWith(".") &&
      TEXT_EXTENSIONS.has(extension)
    ) ||
    /^(?:Dockerfile|Makefile|Procfile|LICENSE)$/i.test(basename)
  );
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function isDocumentationPath(relativePath) {
  const lower = relativePath.toLowerCase();
  return (
    path.posix.basename(lower).startsWith("readme") ||
    lower.startsWith("docs/") ||
    lower.startsWith("adr/") ||
    lower === "changelog.md"
  );
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function isArtifactPath(relativePath) {
  return /^(?:reports|briefings|evals\/reports|sample_outputs)\//i.test(
    relativePath
  );
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function isVerificationPath(relativePath) {
  return (
    isDocumentationPath(relativePath) ||
    relativePath === "package.json" ||
    relativePath === "runtime/build-metadata.json" ||
    relativePath === ".codex-plugin/plugin.json" ||
    relativePath === ".claude-plugin/plugin.json" ||
    relativePath === "MANIFEST.sha256"
  );
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function isGeneratedPairPath(relativePath) {
  return (
    relativePath.startsWith("src/v1/") ||
    relativePath.startsWith("runtime/") ||
    relativePath.startsWith("src/continuity/") ||
    relativePath.startsWith("runtime/src/continuity/")
  );
}

/**
 * @param {string} relativePath
 * @returns {RepositoryEvidence["kind"]}
 */
function evidenceKind(relativePath) {
  if (isDocumentationPath(relativePath)) return "documentation";
  if (
    relativePath.endsWith(".json") ||
    relativePath.endsWith(".toml") ||
    relativePath === "go.mod"
  ) {
    return "metadata";
  }
  if (
    /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/i.test(relativePath) ||
    relativePath.endsWith(".test.js")
  ) {
    return "validation";
  }
  if (isArtifactPath(relativePath) || relativePath.startsWith("runtime/")) {
    return "artifact";
  }
  return "source";
}

/**
 * @param {RepositoryEvidence} evidence
 * @returns {{
 *   kind: RepositoryEvidence["kind"],
 *   path: import("../core/trust.js").RepositoryValue,
 *   size: number,
 *   sha256: string,
 *   excerpt: import("../core/trust.js").RepositoryValue,
 *   truncated: boolean
 * }}
 */
function publicEvidence(evidence) {
  return {
    kind: evidence.kind,
    path: repositoryIdentifier(evidence.path, 4_096),
    size: evidence.size,
    sha256: evidence.sha256,
    excerpt: repositoryValue(evidence.content, MAX_EXCERPT_BYTES),
    truncated: evidence.truncated
  };
}

/**
 * Keep repository-derived diagnostic paths explicitly trust-labeled in
 * structured output while retaining numeric limits and generic diagnostics.
 *
 * @param {InspectionCoverage} coverage
 * @returns {Omit<
 *   InspectionCoverage,
 *   "rejected_path_samples" | "unreadable_path_samples"
 * > & {
 *   rejected_path_samples: import("../core/trust.js").RepositoryValue[],
 *   unreadable_path_samples: import("../core/trust.js").RepositoryValue[]
 * }}
 */
function publicCoverage(coverage) {
  return {
    ...coverage,
    rejected_path_samples: coverage.rejected_path_samples.map((value) =>
      repositoryIdentifier(value, 4_096)
    ),
    unreadable_path_samples: coverage.unreadable_path_samples.map((value) =>
      repositoryIdentifier(value, 4_096)
    )
  };
}

/**
 * @returns {InspectionCoverage}
 */
function createCoverage() {
  return {
    complete: true,
    instruction_complete: true,
    entries_visited: 0,
    files_observed: 0,
    fixed_directories_excluded: 0,
    ignore_entries_excluded: 0,
    sensitive_files_excluded: 0,
    rejected_paths: 0,
    unreadable_paths: 0,
    rejected_path_samples: [],
    unreadable_path_samples: [],
    budgets_reached: [],
    diagnostics: [],
    limits: {
      max_files: MAX_FILES,
      max_entries: MAX_ENTRIES,
      max_file_bytes: MAX_FILE_BYTES,
      max_hash_bytes: MAX_HASH_BYTES,
      max_scan_ms: MAX_SCAN_MS,
      max_evidence_items: MAX_EVIDENCE_ITEMS,
      max_evidence_bytes: MAX_EVIDENCE_BYTES
    }
  };
}

/**
 * @param {InspectionCoverage} coverage
 * @param {number} fileCount
 * @param {import("./git.js").GitObservation} git
 * @returns {void}
 */
function finishCoverage(coverage, fileCount, git) {
  coverage.files_observed = fileCount;
  coverage.diagnostics = boundedDiagnostics(
    [
      ...coverage.diagnostics,
      ...git.diagnostics
    ],
    16,
    512
  );
  coverage.complete =
    coverage.instruction_complete &&
    coverage.budgets_reached.length === 0 &&
    coverage.rejected_paths === 0 &&
    coverage.unreadable_paths === 0 &&
    coverage.sensitive_files_excluded === 0 &&
    coverage.ignore_entries_excluded === 0;
}

/**
 * @param {InspectionCoverage} coverage
 * @param {string} name
 * @returns {void}
 */
function noteBudget(coverage, name) {
  if (!coverage.budgets_reached.includes(name)) {
    coverage.budgets_reached.push(name);
  }
}

/**
 * Record a limit that affects individual evidence without terminating the
 * directory walk.
 *
 * @param {InspectionCoverage} coverage
 * @param {string} name
 * @returns {void}
 */
function noteNonterminalBudget(coverage, name) {
  noteBudget(coverage, name);
}

/**
 * @param {InspectionCoverage} coverage
 * @returns {boolean}
 */
function terminalBudgetReached(coverage) {
  return coverage.budgets_reached.some((name) =>
    name === "max_entries" ||
    name === "max_files" ||
    name === "max_scan_ms"
  );
}

/**
 * @param {InspectionCoverage} coverage
 * @param {{status: string, relative_path: string | null, diagnostic: string}} result
 * @returns {void}
 */
function recordReadFailure(coverage, result) {
  if (result.status === "rejected" || result.status === "outside-root") {
    coverage.rejected_paths += 1;
    samplePath(coverage.rejected_path_samples, result.relative_path || "");
  } else {
    coverage.unreadable_paths += 1;
    samplePath(coverage.unreadable_path_samples, result.relative_path || "");
  }
  coverage.diagnostics.push(result.diagnostic);
}

/**
 * @param {InspectionCoverage} coverage
 * @param {{status: string, relative_path: string | null, diagnostic: string}} result
 * @returns {void}
 */
function recordPathFailure(coverage, result) {
  recordReadFailure(coverage, result);
}

/**
 * @param {string[]} values
 * @param {string} value
 * @returns {void}
 */
function samplePath(values, value) {
  if (values.length >= MAX_DIAGNOSTIC_PATHS) {
    return;
  }
  const selected = repositoryIdentifier(value, 4_096).value;
  if (selected && !values.includes(selected)) {
    values.push(selected);
  }
}

/**
 * @param {Buffer} bytes
 * @returns {string}
 */
function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Locale-independent ordering keeps evidence selection and fingerprints
 * stable across host locale settings.
 *
 * @param {string} left
 * @param {string} right
 * @returns {-1 | 0 | 1}
 */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @param {string} diagnostic
 * @returns {RepositoryInspection}
 */
function invalidInspection(diagnostic) {
  return {
    schema: "kanon-repository-inspection-v1",
    ok: false,
    status: "Unknown",
    diagnostic: sanitizeDisplayText(diagnostic, 512),
    diagnostics: [],
    trust: "repository-untrusted"
  };
}
