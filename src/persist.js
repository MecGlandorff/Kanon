import fs from "node:fs";
import path from "node:path";
import { renderBrief, renderResume } from "./render.js";

export function writeKanonOutputs(analysis, options = {}) {
  const kanonDir = path.join(analysis.root, ".kanon");
  const snapshotsDir = path.join(kanonDir, "snapshots");
  fs.mkdirSync(snapshotsDir, { recursive: true });

  const previous = readPreviousState(analysis.root);
  const timestamp = analysis.state.generated_at.replace(/[:.]/g, "-");

  fs.writeFileSync(
    path.join(kanonDir, ".gitignore"),
    "*\n!.gitignore\n!KANON.md\n",
    "utf8"
  );
  fs.writeFileSync(path.join(kanonDir, "KANON.md"), renderBrief(analysis, options), "utf8");
  fs.writeFileSync(path.join(kanonDir, "STATE.json"), `${JSON.stringify(analysis.state, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(kanonDir, "HANDOFF.md"), renderResume(analysis, previous), "utf8");
  fs.writeFileSync(
    path.join(kanonDir, "config.json"),
    `${JSON.stringify(defaultConfig(), null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(snapshotsDir, `${timestamp}.json`),
    `${JSON.stringify(analysis.state, null, 2)}\n`,
    "utf8"
  );

  if (analysis.evidence.length) {
    fs.appendFileSync(
      path.join(kanonDir, "EVIDENCE.jsonl"),
      `${analysis.evidence.map((record) => JSON.stringify(record)).join("\n")}\n`,
      "utf8"
    );
  }

  return {
    kanonDir,
    written: [
      ".kanon/.gitignore",
      ".kanon/KANON.md",
      ".kanon/STATE.json",
      ".kanon/EVIDENCE.jsonl",
      ".kanon/HANDOFF.md",
      ".kanon/config.json",
      `.kanon/snapshots/${timestamp}.json`
    ]
  };
}

export function readPreviousState(root) {
  const statePath = path.join(root, ".kanon", "STATE.json");
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

function defaultConfig() {
  return {
    version: 1,
    commit_policy: "commit .kanon/KANON.md; keep volatile state local",
    command_execution: "ask before running repo tests/builds",
    evidence_model: "weighted: code/config/tests outrank README for current behavior"
  };
}
