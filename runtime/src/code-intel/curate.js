import {
  add,
  byPattern,
  byPath,
  directDeclarations,
  finish,
  primaryEntrypoints,
  rootReadme
} from "./curate-common.js";
import { registeredHeuristic } from "./heuristics.js";
import { observeRanking } from "./shared.js";

/** @typedef {import("./shared.js").RankedFile} RankedFile */
/**
 * @typedef {{
 *   enter: (
 *     name: string,
 *     ordering: string[],
 *     quota: number | null
 *   ) => void,
 *   decision: (
 *     item: RankedFile,
 *     decision: "selected" | "duplicate" | "policy-excluded" | "quota-excluded" | "not-selected",
 *     reason: string,
 *     heuristic: string | null,
 *     selectedCount?: number,
 *     displacedBy?: string | null
 *   ) => void,
 *   exit: (selectedOverride?: RankedFile[]) => void,
 *   current: () => {name: string, ordinal: number}
 * }} CurationTrace
 */

/** @type {[string, string, string][]} */
const ROOT_CONTRACTS = [
  ["package.json", "root-manifest", "root package manifest"],
  ["pyproject.toml", "root-manifest", "root Python manifest"],
  ["setup.py", "root-manifest", "root Python package manifest"],
  ["setup.cfg", "root-manifest", "root Python package configuration"],
  ["requirements.txt", "root-manifest", "root dependency manifest"],
  ["Cargo.toml", "root-manifest", "root Cargo manifest"],
  ["go.mod", "root-manifest", "root Go module manifest"],
  ["pnpm-workspace.yaml", "workspace-contract", "root workspace manifest"],
  ["lerna.json", "workspace-contract", "root workspace manifest"]
];
/** @type {[string, string, string][]} */
const WORKSPACE_TASKS = [
  ["nx.json", "workspace-contract", "root workspace task contract"],
  ["turbo.json", "workspace-contract", "root workspace task contract"]
];
const ROOT_TASKS = ["Makefile", "makefile", "GNUmakefile", "Justfile", "justfile"];
const WORKSPACE_MARKERS = new Set([
  "pnpm-workspace.yaml",
  "lerna.json",
  "nx.json",
  "turbo.json"
]);

/**
 * @param {RankedFile[]} ranked
 * @param {{
 *   goModule?: string | null,
 *   observer?: import("./shared.js").RankingObserver
 * }} [context]
 * @returns {RankedFile[]}
 */
export function curateRankedFiles(ranked, context = {}) {
  /** @type {RankedFile[]} */
  const selected = [];
  const trace = createCurationTrace(context.observer, selected);
  const workspace = [...ROOT_CONTRACTS, ...WORKSPACE_TASKS].some(
    ([contract]) =>
      WORKSPACE_MARKERS.has(contract) && byPath(ranked, contract)
  );
  const nonJavaScriptPrimary = [
    "pyproject.toml",
    "setup.py",
    "requirements.txt",
    "Cargo.toml",
    "go.mod"
  ].some((contract) => byPath(ranked, contract));
  const rootContracts = ROOT_CONTRACTS.filter(
    ([contract]) =>
      !(
        contract === "package.json" &&
        nonJavaScriptPrimary &&
        !workspace
      ) &&
      !(
        contract === "setup.py" &&
        byPath(ranked, "pyproject.toml")
      ) &&
      !(
        contract === "setup.cfg" &&
        (
          byPath(ranked, "pyproject.toml") ||
          byPath(ranked, "setup.py")
        )
      ) &&
      !(
        contract === "requirements.txt" &&
        byPath(ranked, "pyproject.toml")
      )
  );
  const manifestEntrypoints = primaryEntrypoints(ranked).filter(
    (item) =>
      item.signals.some((signal) =>
        signal.reason.startsWith("declared ")
      )
  );
  const declarations = directDeclarations(ranked);
  const hasGoRoot = Boolean(byPath(ranked, "go.mod"));
  const primaryGoSelection = hasGoRoot
    ? preferredGoEntrypoint(ranked, context.goModule)
    : null;
  const primaryGoEntrypoint = primaryGoSelection?.item || null;

  trace?.enter("root-readme", ["root-readme-policy"], 1);
  if (!workspace) {
    addRegistered(
      selected,
      rootReadme(ranked),
      "root-readme",
      "root usage contract",
      trace
    );
  }

  trace?.enter("root-contracts", ["declared-contract-order"], null);
  for (const [contract, heuristic, reason] of rootContracts) {
    addRegistered(
      selected,
      byPath(ranked, contract),
      heuristic,
      reason,
      trace
    );
  }
  if (trace) {
    const included = new Set(
      rootContracts.map(([contract]) => contract)
    );
    for (const [contract, heuristic] of ROOT_CONTRACTS) {
      const item = byPath(ranked, contract);
      if (item && !included.has(contract)) {
        trace.decision(
          item,
          "policy-excluded",
          "superseded root contract",
          heuristic
        );
      }
    }
  }

  trace?.enter(
    "workspace-tasks-pre",
    ["declared-contract-order"],
    null
  );
  if (workspace && !byPath(ranked, "Cargo.toml")) {
    addWorkspaceTasks(selected, ranked, trace);
  }

  trace?.enter("root-tasks", ["declared-task-order"], null);
  if (!workspace) {
    for (const task of ROOT_TASKS) {
      addRegistered(
        selected,
        byPath(ranked, task),
        "root-task-contract",
        "root task/build contract",
        trace
      );
    }
  }

  trace?.enter(
    "framework-declarations",
    ["score:desc", "fan_in:desc", "path-depth:asc", "path:asc"],
    null
  );
  for (const declaration of declarations.filter((item) =>
    item.signals.some((signal) => signal.source === "framework")
  )) {
    addRegistered(
      selected,
      declaration,
      "framework-declaration",
      "framework-declared repository file",
      trace
    );
  }

  const manifestQuota = workspace ? 2 : 1;
  trace?.enter(
    "manifest-entrypoints",
    [
      "declared:desc",
      "confidence:desc",
      "score:desc",
      "path-depth:asc",
      "path:asc"
    ],
    manifestQuota
  );
  for (const entrypoint of manifestEntrypoints.slice(0, manifestQuota)) {
    addRegistered(
      selected,
      entrypoint,
      "manifest-entrypoint",
      "manifest-declared executable",
      trace
    );
  }
  if (trace) {
    for (const entrypoint of manifestEntrypoints.slice(manifestQuota)) {
      trace.decision(
        entrypoint,
        "quota-excluded",
        "outside manifest-entrypoint quota",
        "manifest-entrypoint",
        selected.length,
        manifestEntrypoints[manifestQuota - 1]?.path || null
      );
    }
  }

  trace?.enter(
    "go-entrypoint",
    ["module-name", "root-main", "entrypoint-order"],
    1
  );
  if (primaryGoSelection) {
    addRegistered(
      selected,
      primaryGoSelection.item,
      primaryGoSelection.moduleNamed
        ? "module-named-entrypoint"
        : "executable-syntax",
      primaryGoSelection.moduleNamed
        ? "Go module-named executable"
        : "primary Go executable syntax",
      trace
    );
  }

  trace?.enter(
    "ecosystem-test-anchor",
    ["score:desc", "fan_in:desc", "path-depth:asc", "path:asc"],
    1
  );
  const testAnchor = conventionalTestAnchor(ranked);
  if (testAnchor) {
    addRegistered(
      selected,
      testAnchor,
      "ecosystem-test-anchor",
      "ecosystem-conventional test entry",
      trace
    );
  }

  trace?.enter(
    "package-declarations",
    ["score:desc", "fan_in:desc", "path-depth:asc", "path:asc"],
    null
  );
  for (const declaration of declarations.filter((item) =>
    !item.signals.some((signal) => signal.source === "framework")
  )) {
    const framework = declaration.signals.some(
      (signal) => signal.source === "framework"
    );
    addRegistered(
      selected,
      declaration,
      framework ? "framework-declaration" : "manifest-entrypoint",
      framework
        ? "framework-declared repository file"
        : "manifest-declared package target",
      trace
    );
  }

  trace?.enter(
    "workspace-tasks-post",
    ["declared-contract-order"],
    null
  );
  if (workspace && byPath(ranked, "Cargo.toml")) {
    addWorkspaceTasks(selected, ranked, trace);
  }

  trace?.enter("workspace-readme", ["root-readme-policy"], 1);
  if (workspace) {
    addRegistered(
      selected,
      rootReadme(ranked),
      "root-readme",
      "root usage contract",
      trace
    );
  }

  const fanInCandidates = ranked
    .filter((candidate) => candidate.fan_in > 0)
    .filter(
      (candidate) =>
        !hasGoRoot || candidate.path.endsWith(".go")
    );
  if (hasGoRoot) {
    registeredHeuristic("polyglot-root-precedence");
  }
  trace?.enter(
    "fan-in",
    ["fan_in:desc", "score:desc", "path:asc"],
    null
  );
  for (const item of fanInCandidates
    .sort((a, b) =>
      b.fan_in - a.fan_in ||
      b.score - a.score ||
      a.path.localeCompare(b.path)
    )) {
    addRegistered(
      selected,
      item,
      "local-import-fan-in",
      `imported by ${item.fan_in} local file(s)`,
      trace
    );
  }

  trace?.enter(
    "literal-reference",
    ["referenced_by:desc", "score:desc", "path:asc"],
    null
  );
  for (const item of ranked
    .filter((candidate) => candidate.referenced_by > 0)
    .sort((a, b) =>
      b.referenced_by - a.referenced_by ||
      b.score - a.score ||
      a.path.localeCompare(b.path)
    )) {
    addRegistered(
      selected,
      item,
      "literal-local-reference",
      `referenced by ${item.referenced_by} local file(s)`,
      trace
    );
  }

  trace?.enter(
    "executable-syntax",
    [
      "declared:desc",
      "confidence:desc",
      "score:desc",
      "path-depth:asc",
      "path:asc"
    ],
    1
  );
  const executable = primaryEntrypoints(ranked).find(
    (item) =>
      item.path !== primaryGoEntrypoint?.path &&
      !item.signals.some((signal) =>
        signal.reason.startsWith("declared ")
      )
  );
  if (executable) {
    addRegistered(
      selected,
      executable,
      "executable-syntax",
      "language-level executable syntax",
      trace
    );
  }

  trace?.enter("final-cap", ["curation-order"], 5);
  const output = finish(
    selected,
    ranked,
    5,
    context.observer,
    trace?.current()
  );
  trace?.exit(
    output.filter((item) => item.recommended === true)
  );
  return output;
}

/**
 * @param {RankedFile[]} selected
 * @param {RankedFile | null | undefined} item
 * @param {string} heuristicId
 * @param {string} reason
 * @param {CurationTrace | null} trace
 * @returns {void}
 */
function addRegistered(
  selected,
  item,
  heuristicId,
  reason,
  trace
) {
  registeredHeuristic(heuristicId);
  if (!trace) {
    add(selected, item, reason, heuristicId);
    return;
  }
  if (!item) {
    return;
  }
  const selectedCount = selected.length;
  const decision = add(selected, item, reason, heuristicId);
  if (decision !== "absent") {
    trace.decision(
      item,
      decision,
      reason,
      heuristicId,
      selectedCount
    );
  }
}

/**
 * @param {RankedFile[]} ranked
 * @returns {RankedFile | null}
 */
function conventionalTestAnchor(ranked) {
  if (byPath(ranked, "Cargo.toml")) {
    return byPattern(
      ranked,
      /^tests\/(?:[^/]+\/)*(?:tests?|integration_tests|cli_tests)\.rs$/
    ) || byPattern(ranked, /^tests\/[^/]+\.rs$/);
  }
  if (
    byPath(ranked, "pyproject.toml") ||
    byPath(ranked, "setup.py") ||
    byPath(ranked, "requirements.txt")
  ) {
    return byPattern(
      ranked,
      /^(?:tests?|test)\/(?:[^/]+\/)*test[^/]*\.py$/
    );
  }
  return null;
}

/**
 * @param {RankedFile[]} selected
 * @param {RankedFile[]} ranked
 * @param {CurationTrace | null} trace
 * @returns {void}
 */
function addWorkspaceTasks(selected, ranked, trace) {
  for (const [contract, heuristic, reason] of WORKSPACE_TASKS) {
    addRegistered(
      selected,
      byPath(ranked, contract),
      heuristic,
      reason,
      trace
    );
  }
}

/**
 * @param {import("./shared.js").RankingObserver | undefined} observer
 * @param {RankedFile[]} selected
 * @returns {CurationTrace | null}
 */
function createCurationTrace(observer, selected) {
  if (typeof observer !== "function") {
    return null;
  }
  let ordinal = 0;
  let position = 0;
  /** @type {number | null} */
  let currentQuota = null;
  let current = { name: "", ordinal: 0 };
  const exit = (selectedOverride = selected) => {
    if (current.ordinal === 0) {
      return;
    }
    observeRanking(observer, {
      type: "curation-stage-exited",
      stage: current.name,
      stage_ordinal: current.ordinal,
      selected: selectedOverride.map((item) => item.path)
    });
  };
  return {
    enter(name, ordering, quota) {
      exit();
      current = { name, ordinal: ++ordinal };
      currentQuota = quota;
      position = 0;
      observeRanking(observer, {
        type: "curation-stage-entered",
        stage: name,
        stage_ordinal: current.ordinal,
        ordering: [...ordering],
        quota,
        selected: selected.map((item) => item.path)
      });
    },
    decision(
      item,
      decision,
      reason,
      heuristic,
      selectedCount = selected.length,
      displacedBy = null
    ) {
      position += 1;
      observeRanking(observer, {
        type: "curation-decision",
        path: item.path,
        stage: current.name,
        stage_ordinal: current.ordinal,
        entry_position: position,
        selected_count_on_entry: selectedCount,
        decision,
        reason,
        heuristic,
        deduplicated: decision === "duplicate",
        displaced_by: displacedBy,
        quota: currentQuota,
        cap: null
      });
    },
    exit,
    current() {
      return { ...current };
    }
  };
}

/**
 * @param {RankedFile[]} ranked
 * @param {string | null | undefined} modulePath
 * @returns {{item: RankedFile, moduleNamed: boolean} | null}
 */
function preferredGoEntrypoint(ranked, modulePath) {
  const entrypoints = primaryEntrypoints(ranked).filter((item) =>
    item.path.endsWith(".go")
  );
  const parts = String(modulePath || "").split("/").filter(Boolean);
  if (/^v\d+$/.test(parts.at(-1) || "")) {
    parts.pop();
  }
  const moduleName = parts.at(-1)?.toLowerCase();
  const preferred = moduleName
    ? entrypoints.find((item) =>
        item.path.toLowerCase() === `cmd/${moduleName}/main.go`
      )
    : null;
  if (preferred) {
    return { item: preferred, moduleNamed: true };
  }
  const item =
    entrypoints.find((candidate) => candidate.path === "main.go") ||
    entrypoints[0] ||
    null;
  return item ? { item, moduleNamed: false } : null;
}
