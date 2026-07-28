import {
  add,
  byPath,
  finish,
  primaryEntrypoints,
  rootReadme
} from "./curate-common.js";
import { registeredHeuristic } from "./heuristics.js";

/** @typedef {import("./shared.js").RankedFile} RankedFile */

/** @type {[string, string, string][]} */
const ROOT_CONTRACTS = [
  ["package.json", "root-manifest", "root package manifest"],
  ["pyproject.toml", "root-manifest", "root Python manifest"],
  ["setup.py", "root-manifest", "root Python package manifest"],
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
 * @param {{goModule?: string | null}} [context]
 * @returns {RankedFile[]}
 */
export function curateRankedFiles(ranked, context = {}) {
  /** @type {RankedFile[]} */
  const selected = [];
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
      )
  );
  const manifestEntrypoints = primaryEntrypoints(ranked).filter(
    (item) =>
      item.signals.some((signal) =>
        signal.reason.startsWith("declared ")
      )
  );
  const frameworkDeclarations = ranked
    .filter((item) =>
      item.signals.some(
        (signal) =>
          signal.type === "declaration" &&
          signal.source === "framework"
      )
    )
    .sort((a, b) =>
      b.score - a.score ||
      a.path.localeCompare(b.path)
    );
  const hasGoRoot = Boolean(byPath(ranked, "go.mod"));
  const primaryGoSelection = hasGoRoot
    ? preferredGoEntrypoint(ranked, context.goModule)
    : null;
  const primaryGoEntrypoint = primaryGoSelection?.item || null;

  if (!workspace) {
    addRegistered(
      selected,
      rootReadme(ranked),
      "root-readme",
      "root usage contract"
    );
  }
  for (const [contract, heuristic, reason] of rootContracts) {
    addRegistered(
      selected,
      byPath(ranked, contract),
      heuristic,
      reason
    );
  }

  if (workspace && !byPath(ranked, "Cargo.toml")) {
    addWorkspaceTasks(selected, ranked);
  }
  if (!workspace) {
    for (const task of ROOT_TASKS) {
      const candidate = byPath(ranked, task);
      if (!candidate?.signals.some(
        (signal) => signal.reason === "declared root task contract"
      )) {
        continue;
      }
      addRegistered(
        selected,
        candidate,
        "root-task-contract",
        "root task/build contract"
      );
    }
  }

  for (const declaration of frameworkDeclarations) {
    addRegistered(
      selected,
      declaration,
      "framework-declaration",
      "framework-declared repository file"
    );
  }
  for (const entrypoint of manifestEntrypoints.slice(0, 1)) {
    addRegistered(
      selected,
      entrypoint,
      "manifest-entrypoint",
      "manifest-declared executable"
    );
  }
  if (primaryGoSelection) {
    addRegistered(
      selected,
      primaryGoSelection.item,
      primaryGoSelection.moduleNamed
        ? "module-named-entrypoint"
        : "executable-syntax",
      primaryGoSelection.moduleNamed
        ? "Go module-named executable"
        : "primary Go executable syntax"
    );
  }

  if (workspace && byPath(ranked, "Cargo.toml")) {
    addWorkspaceTasks(selected, ranked);
  }
  if (workspace) {
    addRegistered(
      selected,
      rootReadme(ranked),
      "root-readme",
      "root usage contract"
    );
  }
  if (hasGoRoot) {
    registeredHeuristic("polyglot-root-precedence");
  }
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
      `referenced by ${item.referenced_by} local file(s)`
    );
  }
  const syntaxExecutables = primaryEntrypoints(ranked).filter(
    (item) =>
      item.path !== primaryGoEntrypoint?.path &&
      !item.signals.some((signal) =>
        signal.reason.startsWith("declared ")
      )
  );
  const executable =
    syntaxExecutables.length === 1 ? syntaxExecutables[0] : null;
  if (executable) {
    addRegistered(
      selected,
      executable,
      "executable-syntax",
      "language-level executable syntax"
    );
  }
  return finish(selected, ranked);
}

/**
 * @param {RankedFile[]} selected
 * @param {RankedFile | null | undefined} item
 * @param {string} heuristicId
 * @param {string} reason
 * @returns {void}
 */
function addRegistered(selected, item, heuristicId, reason) {
  registeredHeuristic(heuristicId);
  add(selected, item, reason, heuristicId);
}

/**
 * @param {RankedFile[]} selected
 * @param {RankedFile[]} ranked
 * @returns {void}
 */
function addWorkspaceTasks(selected, ranked) {
  for (const [contract, heuristic, reason] of WORKSPACE_TASKS) {
    addRegistered(
      selected,
      byPath(ranked, contract),
      heuristic,
      reason
    );
  }
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
