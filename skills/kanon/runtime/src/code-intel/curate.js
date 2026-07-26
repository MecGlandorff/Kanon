import {
  add,
  byPath,
  finish,
  primaryEntrypoints,
  rootReadme
} from "./curate-common.js";
import { curateDjango } from "./curate-django.js";
import { curateGo } from "./curate-go.js";
import { curatePython } from "./curate-python.js";
import { curateRust } from "./curate-rust.js";
import { curateWorkspace } from "./curate-workspace.js";

export function curateRankedFiles(ranked, context = {}) {
  if (isWorkspace(ranked)) {
    return curateWorkspace(ranked, context);
  }
  if (ranked.some((item) => /(^|\/)manage\.py$/.test(item.path))) {
    return curateDjango(ranked);
  }
  if (byPath(ranked, "go.mod")) {
    return curateGo(ranked);
  }
  if (
    byPath(ranked, "Cargo.toml") &&
    ranked.some((item) => item.path.endsWith(".rs"))
  ) {
    return curateRust(ranked);
  }
  if (ranked.some((item) => item.path.endsWith(".py"))) {
    return curatePython(ranked);
  }
  return curateGeneral(ranked);
}

function curateGeneral(ranked) {
  const selected = [];
  add(selected, rootReadme(ranked), "root usage contract");
  add(selected, byPath(ranked, "package.json"), "package contract");
  add(selected, primaryEntrypoints(ranked)[0], "primary executable");
  add(selected, byPath(ranked, "Makefile"), "root build contract");
  return finish(selected, ranked);
}

function isWorkspace(ranked) {
  return ranked.some((item) =>
    /^(?:pnpm-workspace\.ya?ml|nx\.json|turbo\.json)$/.test(item.path)
  );
}
