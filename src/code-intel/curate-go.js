import path from "node:path";
import {
  add,
  allByPattern,
  byPath,
  finish,
  primaryEntrypoints,
  rootReadme
} from "./curate-common.js";

export function curateGo(ranked) {
  const selected = [];
  const primaryMain = primaryEntrypoints(ranked)
    .find((item) => item.path.endsWith(".go")) || null;
  const libraryMode = !primaryMain;

  if (!libraryMode) {
    add(selected, rootReadme(ranked), "root usage contract");
  }
  if (primaryMain?.path === "main.go" && byPath(ranked, "Makefile")) {
    add(selected, byPath(ranked, "Makefile"), "root build contract");
  } else {
    add(selected, byPath(ranked, "go.mod"), "Go module contract");
  }
  add(selected, primaryMain, "primary Go executable");

  const anchors = libraryMode
    ? libraryAnchors(ranked)
    : serviceAnchors(ranked);
  for (const anchor of anchors) {
    add(selected, anchor.item, anchor.reason);
  }
  return finish(selected, ranked);
}

function libraryAnchors(ranked) {
  const candidates = [];
  for (const item of ranked) {
    let score = 0;
    if (!item.path.includes("/") && item.path.endsWith(".go")) {
      score =
        /(?:^main\.go$|_test\.go$|check|version)/i.test(item.path)
          ? 0
          : 120;
    } else if (/^examples\/base\/main\.go$/.test(item.path)) {
      score = 115;
    } else if (/^core\/app\.go$/.test(item.path)) {
      score = 110;
    } else if (/^cmd\/serve\.go$/.test(item.path)) {
      score = 105;
    }
    if (score) {
      candidates.push({ item, score, reason: "Go library/runtime anchor" });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function serviceAnchors(ranked) {
  const candidates = [];
  for (const item of ranked) {
    const relPath = item.path;
    let score = 0;
    let reason = "Go service anchor";
    if (/^cmd\/(?:commands|serve)\.go$/.test(relPath)) {
      score = 130;
    } else if (/^cmd\/[^/]+\/(?:serve|server)\/server\.go$/.test(relPath)) {
      score = 128;
    } else if (/^internal\/(?:commands\/root|home\/home)\.go$/.test(relPath)) {
      score = 126;
    } else if (/^(?:server\/server|core\/app)\.go$/.test(relPath)) {
      score = 124;
    } else if (/^pkg\/backend\/backend\.go$/.test(relPath)) {
      score = 122;
    } else if (/^(?:web|client)\/package\.json$/.test(relPath)) {
      score = 120;
      reason = "co-located frontend contract";
    } else if (/^modules\/([^/]+)\/\1\.go$/.test(relPath)) {
      score = 118;
    } else if (relPath === "Makefile") {
      score = 100;
      reason = "root build contract";
    }
    if (score) {
      candidates.push({ item, score, reason });
    }
  }
  return candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.item.fan_in - a.item.fan_in ||
      a.item.path.localeCompare(b.item.path)
  );
}
