export const HEURISTIC_REGISTRY = Object.freeze([
  {
    id: "root-readme",
    rationale: "A root README is the repository-wide declared usage contract.",
    ecosystems: ["all"],
    failure_modes: "README may be stale or intentionally minimal.",
    corpus_exposure: "predates-v0.4-development-corpus"
  },
  {
    id: "root-manifest",
    rationale: "Root manifests declare package, module, or workspace boundaries.",
    ecosystems: [
      "JavaScript/TypeScript",
      "Python",
      "Go",
      "Rust"
    ],
    failure_modes: "A root manifest may describe tooling rather than the primary product.",
    corpus_exposure: "predates-v0.4-development-corpus"
  },
  {
    id: "workspace-contract",
    rationale: "Root workspace manifests declare package and task boundaries.",
    ecosystems: ["JavaScript/TypeScript", "polyglot"],
    failure_modes: "A workspace tool configuration may not identify its primary package.",
    corpus_exposure: "added-during-visible-development-work"
  },
  {
    id: "manifest-entrypoint",
    rationale: "A manifest-declared binary is a direct executable declaration.",
    ecosystems: ["JavaScript/TypeScript", "Rust"],
    failure_modes: "The declared target may be generated, optional, or currently broken.",
    corpus_exposure: "predates-v0.4-development-corpus"
  },
  {
    id: "executable-syntax",
    rationale: "Language-level executable syntax is direct structural evidence.",
    ecosystems: [
      "JavaScript/TypeScript",
      "Python",
      "Go",
      "Rust"
    ],
    failure_modes: "Examples and auxiliary tools may also contain executable syntax.",
    corpus_exposure: "predates-v0.4-development-corpus"
  },
  {
    id: "module-named-entrypoint",
    rationale: "A Go module basename directly identifies the matching cmd/<name> executable when present.",
    ecosystems: ["Go"],
    failure_modes: "The primary executable may use a historical or branded name instead.",
    corpus_exposure: "added-during-visible-development-work"
  },
  {
    id: "local-import-fan-in",
    rationale: "Many local importers indicate a shared implementation dependency.",
    ecosystems: [
      "JavaScript/TypeScript",
      "Python",
      "Go",
      "Rust"
    ],
    failure_modes: "Utility modules can have high fan-in without being good orientation entrypoints.",
    corpus_exposure: "added-during-visible-development-work"
  },
  {
    id: "literal-local-reference",
    rationale: "Repeated literal references show that repository files point to a target.",
    ecosystems: ["all"],
    failure_modes: "Generated lists and documentation can inflate reference counts.",
    corpus_exposure: "added-during-visible-development-work"
  },
  {
    id: "root-task-contract",
    rationale: "Root Make and Just files declare repository-wide build tasks.",
    ecosystems: ["all"],
    failure_modes: "Targets may be internal or require unavailable tooling.",
    corpus_exposure: "predates-v0.4-development-corpus"
  },
  {
    id: "framework-declaration",
    rationale: "Framework bootstrap and settings files directly name configuration modules.",
    ecosystems: ["Python/Django"],
    failure_modes: "Dynamic configuration can override or construct module names.",
    corpus_exposure: "added-during-visible-development-work"
  },
  {
    id: "ecosystem-test-anchor",
    rationale: "Cargo and Python document conventional top-level test-suite locations.",
    ecosystems: ["Python", "Rust"],
    failure_modes: "The conventional file may cover only part of the suite.",
    corpus_exposure: "added-during-visible-development-work"
  },
  {
    id: "manifest-command",
    rationale: "Root manifests and package scripts directly declare named tasks.",
    ecosystems: ["JavaScript/TypeScript", "Python"],
    failure_modes: "A declared task may be destructive, broken, or environment-specific.",
    corpus_exposure: "predates-v0.4-development-corpus"
  },
  {
    id: "documented-command",
    rationale: "Root or root-linked contributor documentation explicitly declares a shell candidate.",
    ecosystems: ["all"],
    failure_modes: "Documentation may be stale and prose can resemble commands.",
    corpus_exposure: "predates-v0.4-development-corpus"
  },
  {
    id: "ecosystem-command-convention",
    rationale: "Cargo, Go, and Django publish stable project-level command conventions.",
    ecosystems: ["Python", "Go", "Rust"],
    failure_modes: "Repository-specific wrappers may be required instead.",
    corpus_exposure: "predates-v0.4-development-corpus"
  },
  {
    id: "polyglot-root-precedence",
    rationale: "A root ecosystem manifest prioritizes matching code and commands over nested auxiliary packages.",
    ecosystems: ["polyglot"],
    failure_modes: "The nested package may be the intended user-facing component.",
    corpus_exposure: "added-during-visible-development-work"
  }
]);

export function registeredHeuristic(id) {
  const heuristic = HEURISTIC_REGISTRY.find((item) => item.id === id);
  if (!heuristic) {
    throw new Error(`Unregistered production heuristic: ${id}`);
  }
  return heuristic;
}
