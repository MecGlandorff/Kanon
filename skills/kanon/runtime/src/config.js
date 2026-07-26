import fs from "node:fs";
import path from "node:path";
import { CONFIG_SCHEMA_VERSION } from "./version.js";

export const DEFAULT_CONFIG = Object.freeze({
  version: CONFIG_SCHEMA_VERSION,
  commit_policy: "commit .kanon/KANON.md; keep volatile state local",
  command_execution: "ask before running repo tests/builds",
  evidence_model: "weighted: code/config/tests outrank README for current behavior",
  scan: {
    max_files: 2000,
    max_file_bytes: 750_000,
    respect_git_ignore: true
  }
});

export function readKanonConfig(root) {
  const configPath = path.join(root, ".kanon", "config.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    if (
      parsed.version !== undefined &&
      (!Number.isInteger(parsed.version) || parsed.version < 1 || parsed.version > CONFIG_SCHEMA_VERSION)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function scanOptionsFromConfig(config, overrides = {}) {
  const scan = config?.scan && typeof config.scan === "object" ? config.scan : {};
  return {
    maxFiles: positiveInteger(scan.max_files) || DEFAULT_CONFIG.scan.max_files,
    maxFileBytes: positiveInteger(scan.max_file_bytes) || DEFAULT_CONFIG.scan.max_file_bytes,
    useGitIgnore: scan.respect_git_ignore !== false,
    ...overrides
  };
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}
