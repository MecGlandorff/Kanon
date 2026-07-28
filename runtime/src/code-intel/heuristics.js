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
    rationale: "Root package manifests declare package, module, or workspace boundaries.",
    ecosystems: [
      "JavaScript/TypeScript",
      "Python",
      "Go",
      "Rust"
    ],
    failure_modes: "A root package manifest may describe tooling rather than the primary product.",
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
    rationale: "A manifest-declared binary is direct evidence, but an ambiguous workspace contributes at most one target.",
    ecosystems: ["JavaScript/TypeScript", "Rust"],
    failure_modes: "The selected target may still be optional or secondary within its workspace.",
    corpus_exposure: "constrained-during-visible-development-work"
  },
  {
    id: "executable-syntax",
    rationale: "A unique language-level executable is direct structural evidence; competing executables require independent repository-level corroboration.",
    ecosystems: [
      "JavaScript/TypeScript",
      "Python",
      "Go",
      "Rust"
    ],
    failure_modes: "A unique auxiliary tool may still be mistaken for the primary executable.",
    corpus_exposure: "command-use-constrained-during-visible-development-work"
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
    rationale: "Local import fan-in ranks independently eligible files but does not create eligibility by itself.",
    ecosystems: [
      "JavaScript/TypeScript",
      "Python",
      "Go",
      "Rust"
    ],
    failure_modes: "A central implementation file without a direct declaration may now be omitted.",
    corpus_exposure: "eligibility-constrained-during-visible-development-work"
  },
  {
    id: "literal-local-reference",
    rationale: "A literal contained path in repository content is direct reference evidence; import syntax is counted only as import evidence.",
    ecosystems: ["all"],
    failure_modes: "Generated lists and stale documentation can still point to secondary files.",
    corpus_exposure: "import-double-counting-removed-during-visible-development-work"
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
    rationale: "Framework bootstrap and settings files directly name configuration modules without replacing the direct target with an inherited alias.",
    ecosystems: ["Python/Django"],
    failure_modes: "Dynamic configuration can override or construct module names.",
    corpus_exposure: "alias-chain-constrained-during-visible-development-work"
  },
  {
    id: "manifest-command",
    rationale: "Root manifests and package scripts directly declare named tasks, including exact root-script/workspace-binary aliases.",
    ecosystems: ["JavaScript/TypeScript", "Python"],
    failure_modes: "A declared task may be destructive, broken, or environment-specific.",
    corpus_exposure: "workspace-alias-support-added-during-visible-development-work"
  },
  {
    id: "documented-command",
    rationale: "Root or ordered root-linked documentation explicitly declares a contained command, cwd, phase, or executable component.",
    ecosystems: ["all"],
    failure_modes: "Documentation may be stale and equally supported commands still require abstention.",
    corpus_exposure: "parser-strengthened-during-visible-development-work"
  },
  {
    id: "ecosystem-command-convention",
    rationale: "Existing Cargo, Go, and Django test conventions remain available only for test discovery.",
    ecosystems: ["Python", "Go", "Rust"],
    failure_modes: "Repository-specific test wrappers may be required instead.",
    corpus_exposure: "run-synthesis-removed-during-visible-development-work"
  },
  {
    id: "polyglot-root-precedence",
    rationale: "A root ecosystem manifest prioritizes matching code and commands over nested auxiliary packages.",
    ecosystems: ["polyglot"],
    failure_modes: "The nested package may be the intended user-facing component.",
    corpus_exposure: "added-during-visible-development-work"
  }
]);

/**
 * @param {string} id
 * @returns {(typeof HEURISTIC_REGISTRY)[number]}
 */
export function registeredHeuristic(id) {
  const heuristic = HEURISTIC_REGISTRY.find((item) => item.id === id);
  if (!heuristic) {
    throw new Error(`Unregistered production heuristic: ${id}`);
  }
  return heuristic;
}
