import path from "node:path";
import {
  add,
  allByPattern,
  byPath,
  finish,
  rootReadme,
  shortestPath
} from "./curate-common.js";

const CENTRAL_NAMES = new Set([
  "configurator.py",
  "engine.py",
  "model.py",
  "nn.py",
  "ops.py",
  "tensor.py",
  "trainer.py"
]);

export function curatePython(ranked) {
  const selected = [];
  const readme = rootReadme(ranked);
  const manifest =
    byPath(ranked, "pyproject.toml") ||
    byPath(ranked, "setup.py");
  const pythonFiles = ranked.filter((item) => item.path.endsWith(".py"));

  if (!readme && !manifest && pythonFiles.length <= 20) {
    return curateSmallUndocumented(ranked);
  }

  add(selected, readme, "root usage contract");
  add(selected, manifest, "Python project contract");
  for (const relPath of ["train.py", "model.py", "configurator.py"]) {
    add(selected, byPath(ranked, relPath), "root Python workflow anchor");
  }

  if (manifest) {
    for (const item of centralModules(ranked).slice(0, 2)) {
      add(selected, item, "central Python module");
    }
    add(selected, testAnchor(ranked, pythonFiles.length), "Python test anchor");
  }

  if (byPath(ranked, "train.py")) {
    add(selected, starterConfig(ranked), "training configuration pair");
  }
  return finish(selected, ranked);
}

function centralModules(ranked) {
  return ranked
    .filter((item) => CENTRAL_NAMES.has(path.posix.basename(item.path)))
    .filter(
      (item) =>
        !/(^|\/)(?:data|examples?|extra|projects?|tests?)\//.test(item.path)
    )
    .sort((a, b) => {
      const priority =
        centralPriority(path.posix.basename(b.path)) -
        centralPriority(path.posix.basename(a.path));
      return priority || b.fan_in - a.fan_in || shortestPath(a, b);
    });
}

function centralPriority(basename) {
  return {
    "tensor.py": 100,
    "ops.py": 98,
    "engine.py": 96,
    "model.py": 94,
    "trainer.py": 92,
    "configurator.py": 90,
    "nn.py": 88
  }[basename] || 0;
}

function testAnchor(ranked, pythonFileCount) {
  const candidates = allByPattern(
    ranked,
    /(^|\/)(?:tests?|__tests__)\/(?:test[^/]*|[^/]+_test)\.py$/
  );
  if (candidates.length === 0) {
    return null;
  }
  const semantic = candidates.filter((item) =>
    /(?:engine|huggingface|tiny|model)/i.test(path.posix.basename(item.path))
  );
  if (semantic.length === 1) {
    return semantic[0];
  }
  if (pythonFileCount <= 80 && candidates.length <= 8) {
    return candidates.sort(shortestPath)[0];
  }
  return null;
}

function starterConfig(ranked) {
  return ranked
    .filter((item) => /^config\/train[^/]*\.py$/.test(item.path))
    .sort((a, b) => {
      const aStarter = /(?:char|small|base|default)/i.test(a.path) ? 0 : 1;
      const bStarter = /(?:char|small|base|default)/i.test(b.path) ? 0 : 1;
      return aStarter - bStarter || shortestPath(a, b);
    })[0] || null;
}

function curateSmallUndocumented(ranked) {
  const selected = [];
  for (const item of ranked) {
    if (
      item.score > 0 &&
      !/(^|\/)(?:static|templates)\/.*\.(?:css|js)$/.test(item.path)
    ) {
      add(selected, item, "small undocumented repository anchor");
    }
  }
  return finish(selected, ranked);
}
