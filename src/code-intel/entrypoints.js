import path from "node:path";
import { addSignal, getText, normalizeRelPath, parseCargoBinPaths } from "./shared.js";

export function detectEntrypointSignal(relPath, text) {
  const extension = path.posix.extname(relPath).toLowerCase();
  if (
    extension === ".py" &&
    /if\s+__name__\s*==\s*["']__main__["']\s*:/.test(text)
  ) {
    const framework =
      /execute_from_command_line/.test(text) ? "Django executable" :
      /\b(?:argparse|click|typer)\b/.test(text) ? "Python CLI" :
      "executable Python module";
    return {
      type: "entrypoint",
      confidence: "known",
      score: 62,
      reason: `${framework} guarded by __main__`
    };
  }
  if (
    extension === ".go" &&
    /^\s*package\s+main\b/m.test(text) &&
    /\bfunc\s+main\s*\(/.test(text)
  ) {
    return {
      type: "entrypoint",
      confidence: "known",
      score: 72,
      reason: "Go package main with func main"
    };
  }
  if (extension === ".rs" && /\bfn\s+main\s*\(\s*\)/.test(text)) {
    return {
      type: "entrypoint",
      confidence: "known",
      score: 72,
      reason: "Rust binary main function"
    };
  }
  if (
    [".js", ".mjs", ".cjs", ".ts"].includes(extension) &&
    (/^#!.*\bnode\b/m.test(text) || /\b(?:parseArgs|Command|commander|yargs)\b/.test(text))
  ) {
    const executable = /^#!.*\bnode\b/m.test(text);
    return {
      type: "entrypoint",
      confidence: executable ? "known" : "likely",
      score: executable ? 75 : 45,
      reason: executable ? "executable Node script" : "JavaScript CLI signals"
    };
  }
  return null;
}

export function addManifestEntrypoints(
  root,
  fileMap,
  texts,
  signals,
  packageJson
) {
  const bin = packageJson?.bin;
  const targets =
    typeof bin === "string" ? [bin] :
    bin && typeof bin === "object" ? Object.values(bin) :
    [];
  for (const target of targets) {
    const normalized = normalizeRelPath(String(target).replace(/^\.\//, ""));
    if (fileMap.has(normalized)) {
      addSignal(signals, normalized, {
        type: "entrypoint",
        confidence: "known",
        score: 105,
        reason: "declared package binary"
      });
    }
  }

  const cargo = fileMap.get("Cargo.toml");
  if (!cargo) {
    return;
  }
  const text = getText(root, cargo.path, texts, 160_000);
  for (const target of parseCargoBinPaths(text, fileMap)) {
    addSignal(signals, target, {
      type: "entrypoint",
      confidence: "known",
      score: 105,
      reason: "declared Cargo binary"
    });
  }
}
