import path from "node:path";
import {
  add,
  allByPattern,
  byPath,
  finish,
  rootReadme,
  shortestPath
} from "./curate-common.js";

export function curateDjango(ranked) {
  const selected = [];
  const manage = allByPattern(ranked, /(^|\/)manage\.py$/, {
    compare: shortestPath
  })[0] || null;
  const manageRoot = manage ? path.posix.dirname(manage.path) : ".";

  add(selected, rootReadme(ranked), "root usage contract");
  add(selected, byPath(ranked, "pyproject.toml"), "Python project contract");
  add(selected, manage, "Django executable");
  add(
    selected,
    byPath(ranked, "Makefile") || byPath(ranked, "requirements.txt"),
    "Django build/dependency contract"
  );
  const settings = djangoAnchor(ranked, manageRoot, "settings");
  add(selected, settings, "Django settings anchor");
  add(
    selected,
    djangoUrls(ranked, settings),
    "Django URL anchor"
  );
  return finish(selected, ranked);
}

function djangoUrls(ranked, settings) {
  if (!settings) {
    return null;
  }
  const marker = settings.path.indexOf("/settings/");
  const projectRoot =
    marker >= 0
      ? settings.path.slice(0, marker)
      : path.posix.dirname(settings.path);
  return ranked.find(
    (item) => item.path === `${projectRoot}/urls.py`
  ) || null;
}

function djangoAnchor(ranked, manageRoot, kind) {
  const pattern =
    kind === "settings"
      ? /(^|\/)settings(?:\/(?:base|common))?\.py$/
      : /(^|\/)urls\.py$/;
  return ranked
    .filter((item) => pattern.test(item.path))
    .filter((item) => !/(^|\/)(?:docs?|tests?)\//.test(item.path))
    .sort((a, b) => {
      const aScoped = inRoot(a.path, manageRoot) ? 0 : 1;
      const bScoped = inRoot(b.path, manageRoot) ? 0 : 1;
      return aScoped - bScoped || shortestPath(a, b);
    })[0] || null;
}

function inRoot(relPath, root) {
  return root === "." || relPath.startsWith(`${root}/`);
}
