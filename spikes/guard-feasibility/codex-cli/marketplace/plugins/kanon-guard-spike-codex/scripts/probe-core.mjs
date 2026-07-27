import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_ID_LENGTH = 4_096;
const MAX_TOOL_NAME_LENGTH = 160;
const DENY_MARKER = "KANON_GUARD_SPIKE_DENY";
const REWRITE_MARKER = "KANON_GUARD_SPIKE_REWRITE";
const COVERED_TOOLS = new Set(["Bash", "apply_patch"]);

export function inspectHook(input, environment = process.env) {
  const eventName = boundedString(input?.hook_event_name, 80);
  const toolName = boundedString(input?.tool_name, MAX_TOOL_NAME_LENGTH);
  const marker = inputMarker(input?.tool_input);
  const pluginData = probePluginData(environment.PLUGIN_DATA);
  const observation = {
    schema: "kanon-guard-feasibility-observation-v1",
    host: "codex-cli",
    hook_event_name: eventName || "unknown",
    session_start_source: boundedString(input?.source, 80) || null,
    tool_name: toolName || null,
    marker,
    session_id: identity(input?.session_id),
    turn_id: identity(input?.turn_id),
    cwd: identity(input?.cwd),
    plugin_root_present: Boolean(boundedString(environment.PLUGIN_ROOT, MAX_ID_LENGTH)),
    plugin_data: pluginData,
    tool_input_shape: inputShape(input?.tool_input),
    decision: "observe"
  };
  const output = preToolDecision(input, eventName, toolName, marker);
  if (output) {
    observation.decision = marker === "deny" ? "deny" : "rewrite";
  }
  observation.evidence_sink = writeEvidence(
    environment.KANON_GUARD_SPIKE_EVIDENCE_FILE,
    environment.KANON_GUARD_SPIKE_EVIDENCE_ROOT,
    observation
  );
  return { observation, output };
}

function preToolDecision(input, eventName, toolName, marker) {
  if (eventName !== "PreToolUse") {
    return null;
  }
  if (marker === "deny" && COVERED_TOOLS.has(toolName)) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Kanon Guard feasibility spike denied the marked tool call."
      }
    };
  }
  if (
    marker === "rewrite" &&
    toolName === "Bash" &&
    plainObject(input?.tool_input) &&
    typeof input.tool_input.command === "string" &&
    validCwd(input?.cwd)
  ) {
    const output = path.join(input.cwd, "kanon-guard-spike-rewrite-output.txt");
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: {
          command: `printf '%s\\n' 'KANON_GUARD_SPIKE_REWRITTEN' > ${shellQuote(output)}`
        }
      }
    };
  }
  return null;
}

function inputMarker(value) {
  let serialized = "";
  try {
    serialized = JSON.stringify(value).slice(0, 16 * 1024);
  } catch {
    return "none";
  }
  if (serialized.includes(DENY_MARKER)) return "deny";
  if (serialized.includes(REWRITE_MARKER)) return "rewrite";
  return "none";
}

function inputShape(value) {
  return {
    object: plainObject(value),
    command: typeof value?.command === "string",
    file_path: typeof value?.file_path === "string"
  };
}

function identity(value) {
  const text = boundedString(value, MAX_ID_LENGTH);
  return text
    ? {
        present: true,
        sha256: crypto.createHash("sha256").update(text).digest("hex")
      }
    : { present: false, sha256: null };
}

function probePluginData(value) {
  const directory = boundedString(value, MAX_ID_LENGTH);
  if (!directory) {
    return { present: false, writable: "unknown", reason: "missing" };
  }
  if (!path.isAbsolute(directory)) {
    return { present: true, writable: "unknown", reason: "relative-directory" };
  }
  try {
    const root = path.resolve(directory);
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      return { present: true, writable: "unknown", reason: "unsafe-directory" };
    }
    const probe = path.join(root, `.kanon-guard-spike-${process.pid}-${crypto.randomUUID()}`);
    let descriptor;
    let opened = false;
    let failure = null;
    try {
      descriptor = fs.openSync(
        probe,
        fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_WRONLY |
          (fs.constants.O_NOFOLLOW || 0),
        0o600
      );
      opened = true;
      fs.writeFileSync(descriptor, "probe\n", "utf8");
    } catch (error) {
      failure = error;
    } finally {
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor);
        } catch (error) {
          failure ||= error;
        }
      }
      if (opened) {
        try {
          fs.unlinkSync(probe);
        } catch (error) {
          failure ||= error;
        }
      }
    }
    if (failure) {
      return {
        present: true,
        writable: "unknown",
        reason: boundedString(failure?.code, 80) || "write-failed"
      };
    }
    return { present: true, writable: true, reason: null };
  } catch (error) {
    return {
      present: true,
      writable: "unknown",
      reason: boundedString(error?.code, 80) || "write-failed"
    };
  }
}

function writeEvidence(value, rootValue, observation) {
  const target = boundedString(value, MAX_ID_LENGTH);
  const rootValueText = boundedString(rootValue, MAX_ID_LENGTH);
  if (!target || !rootValueText) {
    return { written: false, reason: "not-configured" };
  }
  if (!path.isAbsolute(target) || !path.isAbsolute(rootValueText)) {
    return { written: false, reason: "relative-evidence-path" };
  }
  try {
    const root = path.resolve(rootValueText);
    const output = path.resolve(target);
    const relative = path.relative(root, output);
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      return { written: false, reason: "outside-evidence-root" };
    }
    const rootStat = fs.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return { written: false, reason: "unsafe-evidence-root" };
    }
    const parent = path.dirname(output);
    const stat = fs.lstatSync(parent);
    if (parent !== root || !stat.isDirectory() || stat.isSymbolicLink()) {
      return { written: false, reason: "unsafe-parent" };
    }
    let existing = null;
    try {
      existing = fs.lstatSync(output);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (
      existing &&
      (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)
    ) {
      return { written: false, reason: "unsafe-evidence-file" };
    }
    let descriptor;
    try {
      descriptor = fs.openSync(
        output,
        fs.constants.O_CREAT |
          fs.constants.O_APPEND |
          fs.constants.O_WRONLY |
          (fs.constants.O_NOFOLLOW || 0),
        0o600
      );
      fs.writeFileSync(descriptor, `${JSON.stringify(observation)}\n`, "utf8");
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    return { written: true, reason: null };
  } catch (error) {
    return {
      written: false,
      reason: boundedString(error?.code, 80) || "write-failed"
    };
  }
}

function validCwd(value) {
  const cwd = boundedString(value, MAX_ID_LENGTH);
  return Boolean(cwd && path.isAbsolute(cwd));
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function boundedString(value, limit) {
  return typeof value === "string" && value.length > 0 && value.length <= limit
    ? value
    : "";
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
