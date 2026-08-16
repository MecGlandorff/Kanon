import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import {
  boundedDiagnostics,
  isBoundedString,
  repositoryIdentifier,
  repositoryValue,
  sanitizeDisplayText
} from "../core/trust.js";
import {
  listGitVisibleFiles,
  observeRepositoryGit
} from "./git.js";
import {
  canonicalizeRepositoryRoot,
  isCompatibilitySensitiveRepositoryPath,
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
const MAX_IGNORE_WILDCARDS = 64;
const MAX_IGNORE_MATCH_WORK = 1_000_000;
const MAX_EVIDENCE_ITEMS = 12;
const MAX_INSTRUCTION_ITEMS = 8;
const MAX_EVIDENCE_BYTES = 64 * 1024;
const MAX_EXCERPT_BYTES = 8 * 1024;
const MAX_DIAGNOSTIC_PATHS = 16;
const FIXED_EXCLUDED_DIRECTORIES = new Set([
  ".git", ".hg", ".svn", ".kanon", "node_modules", "coverage",
  ".nyc_output", "dist"
]);
const COMPATIBILITY_EXCLUDED_DIRECTORIES = new Set([
  "vendor", "build", ".next", ".nuxt", ".cache", ".venv", "venv",
  "__pycache__", ".pytest_cache", ".mypy_cache", ".tox"
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
const COMPATIBILITY_TEXT_EXTENSIONS = new Set([
  ".adoc", ".cjs", ".csv", ".cts", ".lock", ".mdx", ".properties",
  ".rst", ".svelte", ".vue"
]);
const COMPATIBILITY_TEXT_NAMES = new Set([
  ".gitignore", "go.mod", "README", "requirements.txt"
]);
const INSTRUCTION_NAMES = Object.freeze([
  "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md",
  ".github/copilot-instructions.md"
]);
const BASELINE_PATHS = new Map([
  ["README.md", 100], ["README", 98], ["package.json", 96],
  ["pyproject.toml", 94], ["Cargo.toml", 94], ["go.mod", 94],
  ["Makefile", 90], ["CHANGELOG.md", 72], ["RELEASING.md", 72]
]);
/** @type {WeakMap<object, Map<string, string>>} */
const INSPECTION_TEXTS = new WeakMap();
/**
 * @typedef {"orient" | "resume" | "steer" | "verify"} InspectionProfile
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
 *   strategy: "filesystem" | "git",
 *   entries_visited: number,
 *   files_observed: number,
 *   total_bytes_hashed: number,
 *   total_text_bytes_read: number,
 *   elapsed_ms: number,
 *   fixed_directories_excluded: number,
 *   ignore_entries_excluded: number,
 *   sensitive_files_excluded: number,
 *   symlinks_skipped: number,
 *   outside_root_paths: number,
 *   missing_tracked_files: number,
 *   git_ignore_observation_failed: boolean,
 *   git_ignore_diagnostic: string | null,
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
 *     max_total_text_bytes: number,
 *     max_scan_ms: number,
 *     max_ignore_bytes: number,
 *     max_ignore_match_work: number,
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
 *   git_runner?: import("./git.js").GitRunner,
 *   inspect_git?: boolean,
 *   allow_filesystem_root?: boolean,
 *   scan?: {
 *     maxFiles?: number,
 *     maxEntries?: number,
 *     maxFileBytes?: number,
 *     maxTotalHashBytes?: number,
 *     maxTotalTextBytes?: number,
 *     maxElapsedMs?: number,
 *     maxIgnoreBytes?: number,
 *     gitTimeoutMs?: number,
 *     gitMaxOutputBytes?: number,
 *     useGitIgnore?: boolean,
 *     compatibilityPolicy?: boolean
 *   }
 * }} InspectOptions
 * @typedef {{
 *   max_files: number,
 *   max_entries: number,
 *   max_file_bytes: number,
 *   max_hash_bytes: number,
 *   max_total_text_bytes: number,
 *   max_scan_ms: number,
 *   max_ignore_bytes: number,
 *   git_timeout_ms: number,
 *   git_max_output_bytes: number,
 *   use_git_ignore: boolean,
 *   compatibility_policy: boolean
 * }} InspectionLimits
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
 * @typedef {{
 *   kind: "literal",
 *   value: string
 * } | {
 *   kind: "single"
 * } | {
 *   kind: "star"
 * } | {
 *   kind: "globstar"
 * }} IgnoreToken
 * @typedef {{
 *   tokens: IgnoreToken[],
 *   directory_only: boolean,
 *   anchored: boolean,
 *   negated: boolean
 * }} IgnoreRule
 * @typedef {{
 *   remaining: number,
 *   deadline: number,
 *   exhausted: boolean
 * }} IgnoreMatchBudget
 * @typedef {{
 *   complete: true,
 *   rules: IgnoreRule[]
 * } | {
 *   complete: false,
 *   rules: []
 * }} IgnoreLoadResult
 */
/** @param {unknown} rootInput @param {unknown} taskInput @param {InspectOptions} [options] @returns {RepositoryInspection} */
export function inspectRepository(rootInput, taskInput, options = {}) {
  const profile = options.profile || "orient";
  const limits = inspectionLimits(options.scan);
  if (
    !["orient", "resume", "steer", "verify"].includes(profile) ||
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
  const root = canonicalizeRepositoryRoot(
    rootInput,
    options.allow_filesystem_root === true
  );
  if (!root.ok) {
    return invalidInspection(root.diagnostic);
  }
  const coverage = createCoverage(limits);
  const explicitPaths = extractTaskPaths(task);
  const target =
    options.target !== undefined && isSafeRelativePath(options.target)
      ? options.target.replaceAll("\\", "/")
      : undefined;
  const instructionPaths =
    target === undefined || explicitPaths.includes(target)
      ? explicitPaths
      : [...explicitPaths, target];
  /** @type {string[]} */
  let applicableInstructions = [];
  /** @type {RepositoryEvidence[]} */
  let instructions = [];
  if (!limits.compatibility_policy) {
    instructions = readStableApplicableInstructions(
      root.root,
      instructionPaths,
      coverage
    );
    applicableInstructions = instructions.map((item) => item.path);
  }
  const scan = scanRepository(root.root, coverage, limits, options.git_runner);
  if (limits.compatibility_policy) {
    applicableInstructions = selectInstructionPaths(
      instructionPaths, scan.files, coverage
    );
  }
  const selected = selectEvidencePaths(
    scan.files, applicableInstructions, task, explicitPaths, profile, target
  );
  const texts = readVisibleRepositoryTexts(
    root.root, scan.files, coverage,
    limits.compatibility_policy
      ? null
      : new Set(selected),
    limits.compatibility_policy
      ? new Set(applicableInstructions)
      : new Set(),
    limits.compatibility_policy
  );
  if (limits.compatibility_policy) {
    instructions = readVisibleApplicableInstructions(
      applicableInstructions, scan.files, texts, coverage
    );
  }
  const git = observeRepositoryGit(root.root, {
    enabled: options.inspect_git !== false,
    ...(options.git_runner === undefined ? {} : { runner: options.git_runner }),
    timeout_ms: limits.git_timeout_ms,
    max_output_bytes: limits.git_max_output_bytes,
    compatibility_sensitive_paths: limits.compatibility_policy
  });
  const receiptPaths = selectEvidencePaths(
    scan.files, applicableInstructions, task, explicitPaths, "orient", undefined
  );
  const evidence = [
    ...instructions,
    ...readSelectedEvidence(scan.files, selected, instructions, texts, coverage)
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
  /** @type {Extract<RepositoryInspection, {ok: true}>} */
  const result = {
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
    evidence_complete: coverage.complete && git.observation_complete,
    current_state: buildContinuityState(
      root.root,
      evidence,
      scan.files,
      coverage,
      git
    ),
    trust: "repository-untrusted"
  };
  INSPECTION_TEXTS.set(result, texts);
  return result;
}
/** @param {object} inspection @returns {Map<string, string>} */
export function repositoryInspectionTexts(inspection) {
  return new Map(INSPECTION_TEXTS.get(inspection) || []);
}
/** Read only the existing v0.4 continuity checkpoint and handoff metadata. Missing state is ordinary Unknown input, while malformed or unsafe state is diagnosed and discarded. @param {string} canonicalRoot @returns {PersistedContinuity} */
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
/** @param {RepositoryInspection} inspection @returns {{ repository: { root: import("../core/trust.js").RepositoryValue }, task: string, instructions: { status: "Known" | "Unknown", values: ReturnType<typeof publicEvidence>[] }, git: { status: "Known" | "Unknown", branch: import("../core/trust.js").RepositoryValue | null, head: import("../core/trust.js").RepositoryValue | null, dirty: boolean | null, change_count: number | null, recent_commits: { hash: import("../core/trust.js").RepositoryValue, date: import("../core/trust.js").RepositoryValue, subject: import("../core/trust.js").RepositoryValue }[] }, evidence: ReturnType<typeof publicEvidence>[], coverage: ReturnType<typeof publicCoverage> } | null} */
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
/** @param {string[]} explicitPaths @param {InspectedFile[]} files @param {InspectionCoverage} coverage @returns {string[]} */
function selectInstructionPaths(explicitPaths, files, coverage) {
  const candidates = new Set(INSTRUCTION_NAMES);
  for (const selectedPath of explicitPaths) {
    /** @type {string[]} */
    const directories = [];
    let directory = path.posix.dirname(selectedPath);
    while (directory !== "." && directory !== "/") {
      directories.unshift(directory);
      const parent = path.posix.dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
    for (const applicableDirectory of directories) {
      candidates.add(`${applicableDirectory}/AGENTS.md`);
      candidates.add(`${applicableDirectory}/CLAUDE.md`);
    }
  }
  if (candidates.size > 32) {
    coverage.instruction_complete = false;
    noteBudget(coverage, "max_instruction_candidates");
  }
  const visible = new Set(files.map((file) => file.path));
  return Array.from(candidates).slice(0, 32).filter((candidate) =>
    visible.has(candidate)
  );
}
/** @param {string[]} candidates @param {InspectedFile[]} files @param {Map<string, string>} texts @param {InspectionCoverage} coverage @returns {RepositoryEvidence[]} */
function readVisibleApplicableInstructions(candidates, files, texts, coverage) {
  /** @type {RepositoryEvidence[]} */
  const instructions = [];
  const byPath = new Map(files.map((file) => [file.path, file]));
  let renderedBytes = 0;
  for (const candidate of candidates) {
    if (instructions.length >= MAX_INSTRUCTION_ITEMS) {
      coverage.instruction_complete = false;
      noteBudget(coverage, "max_instruction_items");
      break;
    }
    const file = byPath.get(candidate);
    if (!file) {
      continue;
    }
    const contentText = texts.get(candidate);
    if (contentText === undefined) {
      coverage.instruction_complete = false;
      continue;
    }
    const remaining = coverage.limits.max_evidence_bytes - renderedBytes;
    if (remaining < 1) {
      noteBudget(coverage, "max_total_text_bytes");
      break;
    }
    const maximum = Math.min(MAX_EXCERPT_BYTES, remaining);
    const sanitizationTruncated =
      file.size > Buffer.byteLength(contentText) ||
      Buffer.byteLength(contentText) > maximum;
    const content = sanitizeDisplayText(
      contentText,
      maximum,
      { multiline: true }
    );
    renderedBytes += Buffer.byteLength(content);
    instructions.push({
      kind: "instruction",
      path: candidate,
      size: file.size,
      sha256: sha256(Buffer.from(contentText, "utf8")),
      content,
      truncated: sanitizationTruncated,
      trust: "repository-untrusted"
    });
    if (sanitizationTruncated) {
      coverage.instruction_complete = false;
      noteBudget(coverage, "instruction_truncated");
    }
  }
  return instructions;
}
/** @param {string} root @param {string[]} explicitPaths @param {InspectionCoverage} coverage @returns {RepositoryEvidence[]} */
function readStableApplicableInstructions(root, explicitPaths, coverage) {
  const candidates = new Set(INSTRUCTION_NAMES);
  for (const selectedPath of explicitPaths) {
    /** @type {string[]} */
    const directories = [];
    let directory = path.posix.dirname(selectedPath);
    while (directory !== "." && directory !== "/") {
      directories.unshift(directory);
      const parent = path.posix.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    for (const applicableDirectory of directories) {
      candidates.add(`${applicableDirectory}/AGENTS.md`);
      candidates.add(`${applicableDirectory}/CLAUDE.md`);
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
    const content = sanitizeDisplayText(
      rawContent,
      MAX_EXCERPT_BYTES,
      { multiline: true }
    );
    const sanitizationTruncated =
      Buffer.byteLength(rawContent, "utf8") > MAX_EXCERPT_BYTES;
    const truncated = read.truncated || sanitizationTruncated;
    instructions.push({
      kind: "instruction",
      path: read.relative_path,
      size: read.size,
      sha256: sha256(read.bytes),
      content,
      truncated,
      trust: "repository-untrusted"
    });
    if (truncated) {
      coverage.instruction_complete = false;
      noteBudget(coverage, "instruction_truncated");
    }
  }
  return instructions;
}
/** @param {string} root @param {InspectedFile[]} files @param {InspectionCoverage} coverage @param {Set<string> | null} selectedPaths @param {Set<string>} instructionPaths @param {boolean} compatibilityPolicy @returns {Map<string, string>} */
function readVisibleRepositoryTexts(root, files, coverage, selectedPaths, instructionPaths, compatibilityPolicy) {
  const started = process.hrtime.bigint();
  const deadline = Date.now() + Math.max(
    0,
    coverage.limits.max_scan_ms - coverage.elapsed_ms
  );
  let remaining = coverage.limits.max_total_text_bytes;
  /** @type {Map<string, string>} */ const texts = new Map();
  const selectedFiles = [...files].sort((left, right) =>
    textReadPriority(
      left.path,
      instructionPaths,
      compatibilityPolicy
    ) -
      textReadPriority(
        right.path,
        instructionPaths,
        compatibilityPolicy
      ) ||
    compareText(left.path, right.path)
  );
  for (const file of selectedFiles) {
    if (!file.text || (selectedPaths && !selectedPaths.has(file.path))) continue;
    if (Date.now() > deadline) {
      noteBudget(coverage, "max_scan_ms");
      break;
    }
    const maximum = Math.min(
      coverage.limits.max_file_bytes,
      remaining
    );
    if (maximum < 1) { noteBudget(coverage, "max_total_text_bytes"); break; }
    const read = readBoundedRepositoryFile(
      root,
      file.path,
      maximum,
      { truncate: true }
    );
    if (!read.ok) {
      recordReadFailure(coverage, read);
      continue;
    }
    remaining -= read.bytes.length;
    coverage.total_text_bytes_read += read.bytes.length;
    if (read.truncated) {
      noteNonterminalBudget(
        coverage,
        file.size > coverage.limits.max_file_bytes
          ? "max_file_bytes"
          : "max_total_text_bytes"
      );
    }
    const digest = sha256(read.bytes);
    if (
      read.size !== file.size ||
      read.mtime_ms !== file.mtime_ms ||
      (file.sha256 !== null && !read.truncated && digest !== file.sha256)
    ) {
      coverage.unreadable_paths += 1;
      samplePath(coverage.unreadable_path_samples, file.path);
      coverage.diagnostics.push(
        "A repository file changed between metadata and bounded text inspection."
      );
      continue;
    }
    try {
      texts.set(
        file.path,
        decodeRepositoryText(read.bytes, read.truncated)
      );
    } catch {
      file.text = false;
      noteNonterminalBudget(coverage, "invalid_text");
    }
  }
  coverage.elapsed_ms += elapsedMilliseconds(started);
  return texts;
}
/** @param {Buffer} bytes @param {boolean} _truncated */
function decodeRepositoryText(bytes, _truncated) {
  return new TextDecoder("utf-8").decode(bytes);
}
/** @param {string} selectedPath @param {Set<string>} instructionPaths @param {boolean} compatibilityPolicy @returns {number} */
function textReadPriority(selectedPath, instructionPaths, compatibilityPolicy) {
  if (!compatibilityPolicy) {
    if (selectedPath === "package.json") return 0;
    if (selectedPath === "pyproject.toml") return 1;
    if (/^(?:Makefile|makefile|GNUmakefile|Justfile|justfile)$/.test(selectedPath)) {
      return 2;
    }
    return instructionPaths.has(selectedPath) ? 3 : 4;
  }
  if (/^README(?:\.(?:md|mdx|rst|adoc|txt))?$/i.test(selectedPath)) return 0;
  if (selectedPath === "package.json") return 1;
  if (selectedPath === "pyproject.toml") return 2;
  if (
    /^(?:pytest\.ini|setup\.cfg|tox\.ini|requirements(?:-[^/]+)?\.txt)$/.test(
      selectedPath
    )
  ) return 3;
  if (selectedPath === "SKILL.md") return 4;
  if (/^(?:Makefile|makefile|GNUmakefile|Justfile|justfile)$/.test(selectedPath)) {
    return 5;
  }
  return instructionPaths.has(selectedPath) ? 6 : 7;
}
/** @param {string} root @param {InspectionCoverage} coverage @param {InspectionLimits} limits @param {import("./git.js").GitRunner | undefined} gitRunner @returns {{files: InspectedFile[]}} */
function scanRepository(root, coverage, limits, gitRunner) {
  const started = process.hrtime.bigint();
  const deadline = Date.now() + limits.max_scan_ms;
  const ignore = loadIgnoreRules(
    root,
    coverage,
    limits.max_ignore_bytes,
    limits.compatibility_policy
  );
  if (!ignore.complete) {
    coverage.elapsed_ms = elapsedMilliseconds(started);
    return { files: [] };
  }
  const ignoreRules = ignore.rules;
  /** @type {IgnoreMatchBudget} */
  const ignoreMatchBudget = {
    remaining: MAX_IGNORE_MATCH_WORK,
    deadline,
    exhausted: false
  };
  /** @type {InspectedFile[]} */
  const files = [];
  let hashedBytes = 0;
  if (limits.use_git_ignore) {
    const listing = listGitVisibleFiles(root, {
      ...(gitRunner === undefined ? {} : { runner: gitRunner }),
      timeout_ms: limits.git_timeout_ms,
      max_output_bytes: limits.git_max_output_bytes
    });
    if (listing.ok) {
      coverage.strategy = "git";
      for (const relative of listing.files) {
        if (!visitEntryBudget()) {
          break;
        }
        if (hasFixedExcludedDirectory(
          relative,
          limits.compatibility_policy
        )) {
          coverage.fixed_directories_excluded += 1;
          continue;
        }
        const ignored = matchesIgnore(
          relative,
          false,
          ignoreRules,
          ignoreMatchBudget,
          coverage
        );
        if (ignoreMatchBudget.exhausted) {
          break;
        }
        if (ignored) {
          coverage.ignore_entries_excluded += 1;
          continue;
        }
        if (!addFile(relative)) {
          break;
        }
      }
      return finish();
    }
    const diagnostic = listing.diagnostic ||
      "Git file-list output was unavailable or invalid.";
    coverage.git_ignore_observation_failed = true;
    coverage.git_ignore_diagnostic = diagnostic;
    coverage.diagnostics.push(diagnostic);
  }
  /** @type {{absolute: string, relative: string}[]} */
  const pending = [{ absolute: root, relative: "" }];
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
      limits.max_entries - coverage.entries_visited,
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
      if (Date.now() > deadline) {
        noteBudget(coverage, "max_scan_ms");
        break;
      }
      const entry = entries[index];
      if (!entry) {
        continue;
      }
      coverage.entries_visited += 1;
      if (coverage.entries_visited > limits.max_entries) {
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
        coverage.symlinks_skipped += 1;
        coverage.rejected_paths += 1;
        samplePath(coverage.rejected_path_samples, relative);
        continue;
      }
      if (entry.isDirectory()) {
        if (isFixedExcludedDirectory(
          entry.name,
          limits.compatibility_policy
        )) {
          coverage.fixed_directories_excluded += 1;
          continue;
        }
        const ignored = matchesIgnore(
          relative,
          true,
          ignoreRules,
          ignoreMatchBudget,
          coverage
        );
        if (ignoreMatchBudget.exhausted) {
          break;
        }
        if (ignored) {
          coverage.ignore_entries_excluded += 1;
          if (!ignoreRules.some((rule) => rule.negated)) {
            continue;
          }
        }
        const selected = resolveRepositoryPath(root, relative, "directory");
        if (!selected.ok) {
          recordReadFailure(coverage, selected);
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
      const ignored = matchesIgnore(
        relative,
        false,
        ignoreRules,
        ignoreMatchBudget,
        coverage
      );
      if (ignoreMatchBudget.exhausted) {
        break;
      }
      if (ignored) {
        coverage.ignore_entries_excluded += 1;
        continue;
      }
      if (isSensitiveInspectionPath(relative, limits.compatibility_policy)) {
        coverage.sensitive_files_excluded += 1;
        continue;
      }
      if (!addFile(relative)) {
        break;
      }
    }
  }
  return finish();
  /** @returns {boolean} */
  function visitEntryBudget() {
    if (Date.now() > deadline) {
      noteBudget(coverage, "max_scan_ms");
      return false;
    }
    coverage.entries_visited += 1;
    if (coverage.entries_visited > limits.max_entries) {
      noteBudget(coverage, "max_entries");
      return false;
    }
    return true;
  }
  /** @param {string} relative @returns {boolean} */
  function addFile(relative) {
    if (isSensitiveInspectionPath(relative, limits.compatibility_policy)) {
      coverage.sensitive_files_excluded += 1;
      return true;
    }
    if (files.length >= limits.max_files) {
      noteBudget(coverage, "max_files");
      return false;
    }
    const selected = resolveRepositoryPath(root, relative, "file");
    if (!selected.ok) {
      if (coverage.strategy === "git" && selected.status === "missing") {
        coverage.missing_tracked_files += 1;
      } else {
        recordReadFailure(coverage, selected);
      }
      return true;
    }
    let digest = null;
    let text = isTextPath(relative, limits.compatibility_policy);
    let observedSize = selected.stat.size;
    let observedMtime =
      Number.isFinite(selected.stat.mtimeMs) &&
      selected.stat.mtimeMs >= 0
        ? Math.floor(selected.stat.mtimeMs)
        : null;
    if (selected.stat.size > limits.max_file_bytes) {
      noteNonterminalBudget(coverage, "max_file_bytes");
    } else if (hashedBytes + selected.stat.size > limits.max_hash_bytes) {
      noteNonterminalBudget(coverage, "max_hash_bytes");
    } else {
      const read = readBoundedRepositoryFile(
        root,
        relative,
        limits.max_file_bytes
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
    return true;
  }
  /** @returns {{files: InspectedFile[]}} */
  function finish() {
    coverage.total_bytes_hashed = hashedBytes;
    coverage.elapsed_ms = elapsedMilliseconds(started);
    files.sort((left, right) => compareText(left.path, right.path));
    return { files };
  }
}
/** Read at most the remaining global entry budget plus one sentinel. Directory enumeration therefore cannot allocate in proportion to an unbounded repository-controlled directory. @param {string} directory @param {number} maximumEntries @param {number} deadline @returns {{ ok: true, entries: import("node:fs").Dirent[], truncated: boolean, timed_out: boolean } | { ok: false }} */
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
/** @param {string} root @param {InspectionCoverage} coverage @param {number} maximumBytes @param {boolean} compatibilityPolicy @returns {IgnoreLoadResult} */
function loadIgnoreRules(root, coverage, maximumBytes, compatibilityPolicy) {
  const read = readBoundedRepositoryFile(
    root,
    ".kanonignore",
    maximumBytes
  );
  if (!read.ok) {
    if (read.status === "missing") {
      return { complete: true, rules: [] };
    }
    recordReadFailure(coverage, read);
    return incompleteIgnoreRules(
      coverage,
      "ignore_rules_unavailable",
      "The repository ignore file was unavailable or unsafe; repository content scanning was stopped."
    );
  }
  /** @type {string} */
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(read.bytes);
  } catch {
    return incompleteIgnoreRules(
      coverage,
      "invalid_ignore_rules",
      "The repository ignore file was invalid; repository content scanning was stopped."
    );
  }
  const lines = decoded.split(/\r?\n/);
  /** @type {IgnoreRule[]} */
  const rules = [];
  for (const line of lines) {
    const selected = line.trim();
    if (!selected || selected.startsWith("#")) {
      continue;
    }
    const negated = compatibilityPolicy && selected.startsWith("!");
    const pattern = negated ? selected.slice(1) : selected;
    const portablePattern = pattern.replaceAll("\\", "/");
    const unrootedPattern = portablePattern.replace(/^\//, "");
    if (
      rules.length >= MAX_IGNORE_RULES ||
      (
        compatibilityPolicy
          ? hasTraversalSegment(unrootedPattern) ||
            portablePattern.startsWith("//") ||
            /^[A-Za-z]:\//.test(portablePattern)
          : selected.startsWith("!") ||
            selected.includes("..") ||
            path.isAbsolute(selected)
      ) ||
      pattern.length === 0 ||
      pattern.length > 512 ||
      /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(
        pattern
      )
    ) {
      return incompleteIgnoreRules(
        coverage,
        rules.length >= MAX_IGNORE_RULES
          ? "max_ignore_rules"
          : "invalid_ignore_rules",
        "The repository ignore file contained an invalid, unsupported, or over-limit rule; repository content scanning was stopped."
      );
    }
    const parsed = ignoreRule(pattern, negated);
    if (parsed === null) {
      return incompleteIgnoreRules(
        coverage,
        "max_ignore_rule_complexity",
        "The repository ignore file exceeded the deterministic rule-complexity limit; repository content scanning was stopped."
      );
    }
    rules.push(parsed);
  }
  return { complete: true, rules };
}
/** @param {InspectionCoverage} coverage @param {string} budget @param {string} diagnostic @returns {Extract<IgnoreLoadResult, {complete: false}>} */
function incompleteIgnoreRules(coverage, budget, diagnostic) {
  noteNonterminalBudget(coverage, budget);
  coverage.diagnostics.push(diagnostic);
  return { complete: false, rules: [] };
}
/** @param {string} rule @param {boolean} negated @returns {IgnoreRule | null} */
function ignoreRule(rule, negated) {
  const portable = rule.replaceAll("\\", "/");
  const rooted = portable.startsWith("/");
  const normalized = portable.replace(/^\/+/, "");
  const directoryOnly = normalized.endsWith("/");
  const body = normalized.replace(/\/+$/, "");
  const wildcardCount = Array.from(body).filter(
    (character) => character === "*" || character === "?"
  ).length;
  if (
    !body ||
    wildcardCount > MAX_IGNORE_WILDCARDS
  ) {
    return null;
  }
  /** @type {IgnoreToken[]} */
  const tokens = [];
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "*") {
      if (body[index + 1] === "*") {
        tokens.push({ kind: "globstar" });
        index += 1;
      } else {
        tokens.push({ kind: "star" });
      }
    } else if (character === "?") {
      tokens.push({ kind: "single" });
    } else if (character !== undefined) {
      tokens.push({ kind: "literal", value: character });
    }
  }
  return {
    tokens,
    directory_only: directoryOnly,
    anchored: rooted || body.includes("/"),
    negated
  };
}
/** @param {string} pattern @returns {boolean} */
function hasTraversalSegment(pattern) {
  return pattern.split("/").some((segment) => segment === "..");
}
/** @param {string} relative @param {boolean} directory @param {IgnoreRule[]} rules @param {IgnoreMatchBudget} budget @param {InspectionCoverage} coverage @returns {boolean} */
function matchesIgnore(relative, directory, rules, budget, coverage) {
  let ignored = false;
  const ancestors = ancestorDirectories(relative, directory);
  for (const rule of rules) {
    const candidates = rule.directory_only
      ? ancestors
      : directory
        ? ancestors
        : [relative, ...ancestors];
    for (const selected of candidates) {
      const candidate = rule.anchored
        ? selected
        : selected.slice(selected.lastIndexOf("/") + 1);
      const matched = matchIgnoreTokens(
        rule.tokens,
        candidate,
        budget,
        coverage
      );
      if (matched === null) {
        return false;
      }
      if (matched) {
        ignored = !rule.negated;
        break;
      }
    }
  }
  return ignored;
}
/** @param {string} relative @param {boolean} directory @returns {string[]} */
function ancestorDirectories(relative, directory) {
  const parts = relative.split("/");
  const length = directory ? parts.length : parts.length - 1;
  const ancestors = [];
  for (let index = 1; index <= length; index += 1) {
    ancestors.push(parts.slice(0, index).join("/"));
  }
  return ancestors;
}
/** Deterministic NFA-style glob matching. `star` never crosses a path separator, while `globstar` may. Work and wall-clock limits are shared by the complete repository scan. @param {IgnoreToken[]} tokens @param {string} candidate @param {IgnoreMatchBudget} budget @param {InspectionCoverage} coverage @returns {boolean | null} */
function matchIgnoreTokens(tokens, candidate, budget, coverage) {
  let states = ignoreEpsilonClosure(
    new Set([0]),
    tokens,
    budget,
    coverage
  );
  if (states === null) {
    return null;
  }
  for (const character of candidate) {
    if (!consumeIgnoreMatchWork(budget, coverage)) {
      return null;
    }
    /** @type {Set<number>} */
    const next = new Set();
    for (const state of states) {
      if (!consumeIgnoreMatchWork(budget, coverage)) {
        return null;
      }
      const token = tokens[state];
      if (
        token?.kind === "literal" &&
        token.value === character
      ) {
        next.add(state + 1);
      } else if (
        token?.kind === "single" &&
        character !== "/"
      ) {
        next.add(state + 1);
      } else if (
        token?.kind === "star" &&
        character !== "/"
      ) {
        next.add(state);
      } else if (token?.kind === "globstar") {
        next.add(state);
      }
    }
    states = ignoreEpsilonClosure(next, tokens, budget, coverage);
    if (states === null) {
      return null;
    }
    if (states.size === 0) {
      return false;
    }
  }
  return states.has(tokens.length);
}
/** @param {Set<number>} initial @param {IgnoreToken[]} tokens @param {IgnoreMatchBudget} budget @param {InspectionCoverage} coverage @returns {Set<number> | null} */
function ignoreEpsilonClosure(initial, tokens, budget, coverage) {
  const states = new Set(initial);
  const pending = Array.from(initial);
  while (pending.length > 0) {
    if (!consumeIgnoreMatchWork(budget, coverage)) {
      return null;
    }
    const state = pending.pop();
    if (state === undefined) {
      continue;
    }
    const token = tokens[state];
    if (
      (token?.kind === "star" || token?.kind === "globstar") &&
      !states.has(state + 1)
    ) {
      states.add(state + 1);
      pending.push(state + 1);
    }
  }
  return states;
}
/** @param {IgnoreMatchBudget} budget @param {InspectionCoverage} coverage @returns {boolean} */
function consumeIgnoreMatchWork(budget, coverage) {
  if (budget.exhausted) {
    return false;
  }
  if (Date.now() > budget.deadline) {
    budget.exhausted = true;
    noteBudget(coverage, "max_scan_ms");
    coverage.diagnostics.push(
      "Repository ignore matching exceeded the scan deadline."
    );
    return false;
  }
  if (budget.remaining < 1) {
    budget.exhausted = true;
    noteBudget(coverage, "max_ignore_match_work");
    coverage.diagnostics.push(
      "Repository ignore matching exceeded its deterministic work limit."
    );
    return false;
  }
  budget.remaining -= 1;
  return true;
}
/** @param {InspectedFile[]} files @param {string[]} instructionPaths @param {string} task @param {string[]} explicitPaths @param {InspectionProfile} profile @param {string | undefined} target @returns {string[]} */
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
    if (profile === "resume" || profile === "steer") {
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
/** @param {InspectedFile[]} files @param {string[]} selectedPaths @param {RepositoryEvidence[]} instructions @param {Map<string, string>} texts @param {InspectionCoverage} coverage @returns {RepositoryEvidence[]} */
function readSelectedEvidence(
  files,
  selectedPaths,
  instructions,
  texts,
  coverage
) {
  const instructionPaths = new Set(instructions.map((item) => item.path));
  const byPath = new Map(files.map((file) => [file.path, file]));
  /** @type {RepositoryEvidence[]} */
  const evidence = [];
  let renderedBytes = instructions.reduce(
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
    const remaining = coverage.limits.max_evidence_bytes - renderedBytes;
    if (remaining < 1) {
      noteBudget(coverage, "max_total_text_bytes");
      break;
    }
    const rawContent = texts.get(selectedPath);
    if (rawContent === undefined) continue;
    const maximum = Math.min(MAX_EXCERPT_BYTES, remaining);
    const sanitizationTruncated =
      file.size > Buffer.byteLength(rawContent, "utf8") ||
      Buffer.byteLength(rawContent, "utf8") > maximum;
    const content = sanitizeDisplayText(
      rawContent,
      maximum,
      { multiline: true }
    );
    renderedBytes += Buffer.byteLength(content);
    evidence.push({
      kind: evidenceKind(selectedPath),
      path: selectedPath,
      size: file.size,
      sha256: file.sha256 || sha256(Buffer.from(rawContent)),
      content,
      truncated: sanitizationTruncated,
      trust: "repository-untrusted"
    });
  }
  return evidence;
}
/** @param {string} root @param {string} task @param {RepositoryEvidence[]} instructions @param {string[]} selectedPaths @param {InspectedFile[]} files @param {InspectionCoverage} coverage @param {import("./git.js").GitObservation} git @returns {string} */
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
    ],
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
/** @param {string} root @param {RepositoryEvidence[]} evidence @param {InspectedFile[]} files @param {InspectionCoverage} coverage @param {import("./git.js").GitObservation} git @returns {Record<string, unknown>} */
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
/** @param {RepositoryEvidence[]} evidence @returns {string | null} */
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
/** @param {unknown} task @returns {string[]} */
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
/** @param {string} task @returns {string[]} */
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
/** @param {string} relativePath @param {boolean} compatibilityPolicy @returns {boolean} */
function isTextPath(relativePath, compatibilityPolicy) {
  const basename = path.posix.basename(relativePath);
  const extension = path.posix.extname(basename).toLowerCase();
  return (
    (
      compatibilityPolicy &&
      (
        [".env.example", ".env.sample", ".env.template"].includes(
          basename.toLowerCase()
        ) ||
        COMPATIBILITY_TEXT_NAMES.has(basename) ||
        COMPATIBILITY_TEXT_EXTENSIONS.has(extension)
      )
    ) ||
    (
      !basename.startsWith(".") &&
      TEXT_EXTENSIONS.has(extension)
    ) ||
    /^(?:Dockerfile|Makefile|GNUmakefile|Justfile|Procfile|LICENSE)$/i.test(
      basename
    )
  );
}
/** @param {string} relativePath @returns {boolean} */
function isDocumentationPath(relativePath) {
  const lower = relativePath.toLowerCase();
  return (
    path.posix.basename(lower).startsWith("readme") ||
    lower.startsWith("docs/") ||
    lower.startsWith("adr/") ||
    lower === "changelog.md"
  );
}
/** @param {string} relativePath @returns {boolean} */
function isArtifactPath(relativePath) {
  return /^(?:reports|briefings|evals\/reports|sample_outputs)\//i.test(
    relativePath
  );
}
/** @param {string} relativePath @returns {boolean} */
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
/** @param {string} relativePath @returns {boolean} */
function isGeneratedPairPath(relativePath) {
  return (
    relativePath.startsWith("src/v1/") ||
    relativePath.startsWith("runtime/") ||
    relativePath.startsWith("src/continuity/") ||
    relativePath.startsWith("runtime/src/continuity/")
  );
}
/** @param {string} relativePath @returns {RepositoryEvidence["kind"]} */
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
/** @param {RepositoryEvidence} evidence @returns {{ kind: RepositoryEvidence["kind"], path: import("../core/trust.js").RepositoryValue, size: number, sha256: string, excerpt: import("../core/trust.js").RepositoryValue, truncated: boolean }} */
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
/** @param {InspectionCoverage} coverage */
function publicCoverage(coverage) {
  return {
    complete: coverage.complete,
    instruction_complete: coverage.instruction_complete,
    entries_visited: coverage.entries_visited,
    files_observed: coverage.files_observed,
    fixed_directories_excluded: coverage.fixed_directories_excluded,
    ignore_entries_excluded: coverage.ignore_entries_excluded,
    sensitive_files_excluded: coverage.sensitive_files_excluded,
    rejected_paths: coverage.rejected_paths,
    unreadable_paths: coverage.unreadable_paths,
    rejected_path_samples: coverage.rejected_path_samples.map((value) =>
      repositoryIdentifier(value, 4_096)
    ),
    unreadable_path_samples: coverage.unreadable_path_samples.map((value) =>
      repositoryIdentifier(value, 4_096)
    ),
    budgets_reached: [...coverage.budgets_reached],
    diagnostics: [...coverage.diagnostics],
    limits: {
      max_files: coverage.limits.max_files,
      max_entries: coverage.limits.max_entries,
      max_file_bytes: coverage.limits.max_file_bytes,
      max_hash_bytes: coverage.limits.max_hash_bytes,
      max_scan_ms: coverage.limits.max_scan_ms,
      max_ignore_match_work: coverage.limits.max_ignore_match_work,
      max_evidence_items: coverage.limits.max_evidence_items,
      max_evidence_bytes: coverage.limits.max_evidence_bytes
    }
  };
}
/** @param {InspectionLimits} limits @returns {InspectionCoverage} */
function createCoverage(limits) {
  return {
    complete: true,
    instruction_complete: true,
    strategy: "filesystem",
    entries_visited: 0,
    files_observed: 0,
    total_bytes_hashed: 0,
    total_text_bytes_read: 0,
    elapsed_ms: 0,
    fixed_directories_excluded: 0,
    ignore_entries_excluded: 0,
    sensitive_files_excluded: 0,
    symlinks_skipped: 0,
    outside_root_paths: 0,
    missing_tracked_files: 0,
    git_ignore_observation_failed: false,
    git_ignore_diagnostic: null,
    rejected_paths: 0,
    unreadable_paths: 0,
    rejected_path_samples: [],
    unreadable_path_samples: [],
    budgets_reached: [],
    diagnostics: [],
    limits: {
      max_files: limits.max_files,
      max_entries: limits.max_entries,
      max_file_bytes: limits.max_file_bytes,
      max_hash_bytes: limits.max_hash_bytes,
      max_total_text_bytes: limits.max_total_text_bytes,
      max_scan_ms: limits.max_scan_ms,
      max_ignore_bytes: limits.max_ignore_bytes,
      max_ignore_match_work: MAX_IGNORE_MATCH_WORK,
      max_evidence_items: MAX_EVIDENCE_ITEMS,
      max_evidence_bytes: Math.min(
        MAX_EVIDENCE_BYTES,
        limits.max_total_text_bytes
      )
    }
  };
}
/** @param {InspectionCoverage} coverage @param {number} fileCount @param {import("./git.js").GitObservation} git @returns {void} */
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
    !coverage.git_ignore_observation_failed && coverage.missing_tracked_files === 0;
}
/** @param {InspectionCoverage} coverage @param {string} name @returns {void} */
function noteBudget(coverage, name) {
  if (!coverage.budgets_reached.includes(name)) {
    coverage.budgets_reached.push(name);
  }
}
/** Record a limit that affects individual evidence without terminating the directory walk. @param {InspectionCoverage} coverage @param {string} name @returns {void} */
function noteNonterminalBudget(coverage, name) {
  noteBudget(coverage, name);
}
/** @param {InspectionCoverage} coverage @returns {boolean} */
function terminalBudgetReached(coverage) {
  return coverage.budgets_reached.some((name) =>
    name === "max_entries" ||
    name === "max_files" ||
    name === "max_scan_ms" ||
    name === "max_ignore_match_work"
  );
}
/** @param {InspectionCoverage} coverage @param {{status: string, relative_path: string | null, diagnostic: string}} result @returns {void} */
function recordReadFailure(coverage, result) {
  if (result.status === "rejected" || result.status === "outside-root") {
    coverage.rejected_paths += 1;
    if (result.status === "outside-root") {
      coverage.outside_root_paths += 1;
    }
    if (/\blink\b|junction|reparse point/i.test(result.diagnostic)) {
      coverage.symlinks_skipped += 1;
    }
    samplePath(coverage.rejected_path_samples, result.relative_path || "");
  } else {
    coverage.unreadable_paths += 1;
    samplePath(coverage.unreadable_path_samples, result.relative_path || "");
  }
  coverage.diagnostics.push(result.diagnostic);
}
/** @param {string} name @param {boolean} compatibilityPolicy */
function isFixedExcludedDirectory(name, compatibilityPolicy) {
  return FIXED_EXCLUDED_DIRECTORIES.has(name) ||
    (compatibilityPolicy && COMPATIBILITY_EXCLUDED_DIRECTORIES.has(name));
}
/** @param {string} relativePath @param {boolean} compatibilityPolicy */
function hasFixedExcludedDirectory(relativePath, compatibilityPolicy) {
  return relativePath
    .split("/")
    .some((part) => isFixedExcludedDirectory(part, compatibilityPolicy));
}
/** @param {string} relativePath @param {boolean} compatibilityPolicy */
function isSensitiveInspectionPath(relativePath, compatibilityPolicy) {
  return compatibilityPolicy
    ? isCompatibilitySensitiveRepositoryPath(relativePath)
    : isSensitiveRepositoryPath(relativePath);
}
/** @param {bigint} started */
function elapsedMilliseconds(started) {
  const nanoseconds = process.hrtime.bigint() - started;
  return Math.max(1, Math.ceil(Number(nanoseconds) / 1_000_000));
}
/** @param {InspectOptions["scan"]} input @returns {InspectionLimits} */
function inspectionLimits(input = {}) {
  return {
    max_files: boundedInteger(input.maxFiles, MAX_FILES, 1, 25_000),
    max_entries: boundedInteger(input.maxEntries, MAX_ENTRIES, 1, 100_000),
    max_file_bytes: boundedInteger(
      input.maxFileBytes, MAX_FILE_BYTES, 1_024, 2 * 1024 * 1024
    ),
    max_hash_bytes: boundedInteger(
      input.maxTotalHashBytes, MAX_HASH_BYTES, 1_024, 128 * 1024 * 1024
    ),
    max_total_text_bytes: boundedInteger(
      input.maxTotalTextBytes, 8 * 1024 * 1024, 1_024, 32 * 1024 * 1024
    ),
    max_scan_ms: boundedInteger(input.maxElapsedMs, MAX_SCAN_MS, 100, 30_000),
    max_ignore_bytes: boundedInteger(
      input.maxIgnoreBytes, MAX_IGNORE_BYTES, 1_024, 512 * 1024
    ),
    git_timeout_ms: boundedInteger(input.gitTimeoutMs, 2_000, 100, 60_000),
    git_max_output_bytes: boundedInteger(
      input.gitMaxOutputBytes, 8 * 1024 * 1024, 1_024, 32 * 1024 * 1024
    ),
    use_git_ignore: input.useGitIgnore === true,
    compatibility_policy: input.compatibilityPolicy === true
  };
}
/** @param {unknown} value @param {number} fallback @param {number} minimum @param {number} maximum */
function boundedInteger(value, fallback, minimum, maximum) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}
/** @param {string[]} values @param {string} value @returns {void} */
function samplePath(values, value) {
  if (values.length >= MAX_DIAGNOSTIC_PATHS) {
    return;
  }
  const selected = repositoryIdentifier(value, 4_096).value;
  if (selected && !values.includes(selected)) {
    values.push(selected);
  }
}
/** @param {Buffer} bytes @returns {string} */
function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
/** Locale-independent ordering keeps evidence selection and fingerprints stable across host locale settings. @param {string} left @param {string} right @returns {-1 | 0 | 1} */
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
/** @param {string} diagnostic @returns {RepositoryInspection} */
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
