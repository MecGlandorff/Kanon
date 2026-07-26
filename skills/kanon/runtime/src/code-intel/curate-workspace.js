import path from "node:path";
import {
  add,
  allByPattern,
  byPath,
  finish,
  primaryEntrypoints,
  shortestPath
} from "./curate-common.js";

export function curateWorkspace(ranked, context = {}) {
  const selected = [];
  add(selected, byPath(ranked, "package.json"), "workspace root contract");
  add(
    selected,
    byPath(ranked, "pnpm-workspace.yaml") ||
      byPath(ranked, "pnpm-workspace.yml"),
    "workspace membership contract"
  );

  if (byPath(ranked, "Cargo.toml")) {
    add(selected, byPath(ranked, "Cargo.toml"), "Rust workspace contract");
    const main = workspaceRustMain(ranked);
    add(selected, main, "primary workspace executable");
    add(selected, companionRustLibrary(ranked, main), "primary workspace library");
    return finish(selected, ranked);
  }

  add(
    selected,
    byPath(ranked, "nx.json") || byPath(ranked, "turbo.json"),
    "workspace build graph"
  );
  const bin = primaryEntrypoints(ranked)
    .find((item) => /(^|\/)bin\.[cm]?[jt]s$/.test(item.path));
  add(selected, bin, "workspace CLI entrypoint");

  const primaryPackage = workspacePackage(ranked, context.packageJson, bin);
  if (!bin) {
    add(selected, primaryPackage, "primary workspace package");
  }
  for (const module of publicModules(ranked, primaryPackage, bin)) {
    add(selected, module, "workspace public API");
  }
  return finish(selected, ranked);
}

function workspaceRustMain(ranked) {
  return ranked
    .filter((item) => /^crates\/[^/]+\/src\/main\.rs$/.test(item.path))
    .filter((item) => !/(?:trace|test|bench|xtask|example)/i.test(item.path))
    .sort((a, b) => {
      const aName = a.path.split("/")[1];
      const bName = b.path.split("/")[1];
      return aName.length - bName.length || shortestPath(a, b);
    })[0] || null;
}

function companionRustLibrary(ranked, main) {
  if (!main) {
    return null;
  }
  const crate = main.path.split("/")[1];
  return (
    byPath(ranked, `crates/${crate}-lib/src/lib.rs`) ||
    byPath(ranked, `crates/${crate}/src/lib.rs`)
  );
}

function workspacePackage(ranked, packageJson, bin) {
  const tokens = packageTokens(packageJson?.name);
  if (bin) {
    tokens.unshift(bin.path.split("/")[1]);
  }
  for (const token of tokens) {
    const found = byPath(ranked, `packages/${token}/package.json`);
    if (found) {
      return found;
    }
  }
  return null;
}

function publicModules(ranked, primaryPackage, bin) {
  const output = [];
  const primary =
    primaryPackage?.path.split("/")[1] ||
    bin?.path.split("/")[1] ||
    null;
  if (primary) {
    for (const suffix of [
      "src/index.ts",
      "src/index.js",
      "src/exports/index.js",
      "src/runtime/server/index.js"
    ]) {
      const found = byPath(ranked, `packages/${primary}/${suffix}`);
      if (found) {
        output.push(found);
      }
    }
    const config = byPath(ranked, "packages/config/src/config.ts");
    if (config) {
      output.push(config);
    }
  }
  const candidates = allByPattern(
    ranked,
    /^packages\/[^/]+\/src\/index\.[cm]?[jt]sx?$/
  ).sort((a, b) => publicModuleScore(b) - publicModuleScore(a));
  for (const candidate of candidates) {
    if (!output.some((item) => item.path === candidate.path)) {
      output.push(candidate);
    }
  }
  return output;
}

function publicModuleScore(item) {
  const name = item.path.split("/")[1];
  if (name === "vue") {
    return 140;
  }
  if (/^(?:query-core|runtime-core)$/.test(name)) {
    return 130;
  }
  if (/^(?:react-query|reactivity)$/.test(name)) {
    return 125;
  }
  if (/^(?:core|shared|vue|kit)$/.test(name)) {
    return 120;
  }
  if (/(?:experimental|angular|preact|solid|compiler|devtools)/.test(name)) {
    return 20;
  }
  return 60 - name.length;
}

function packageTokens(name) {
  const value = String(name || "");
  const scope = value.match(/^@([^/]+)\//)?.[1];
  const leaf = value.split("/").pop();
  return Array.from(
    new Set(
      [scope, leaf]
        .filter(Boolean)
        .flatMap((token) => [
          token,
          token.replace(/(?:--root|-monorepo|-root)$/, "")
        ])
        .filter((token) => token && token !== "root" && token !== "repository")
    )
  );
}
