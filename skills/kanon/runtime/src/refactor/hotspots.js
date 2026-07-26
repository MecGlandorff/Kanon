import path from "node:path";

const TEST_PATH = /(^|\/)(test|tests|__tests__)\//;
const TEST_NAME = /\.(test|spec)\.[cm]?[jt]sx?$|test_.*\.py$|_test\.py$/;
const IMPACT_WEIGHT = { high: 3, medium: 2, low: 1 };
const RISK_WEIGHT = { low: 3, medium: 2, high: 1 };

export function fileHotspots(metric) {
  const hotspots = [];
  if (!["source", "test", "config"].includes(metric.kind)) {
    return hotspots;
  }

  const reasons = [];
  let impact = "low";
  let risk = "low";

  if (metric.kind === "source" && metric.lines >= 500) {
    reasons.push(
      `${metric.path} has ${metric.lines} lines, which is a readability risk for a source file.`
    );
    impact = "high";
    risk = "medium";
  } else if (metric.kind === "source" && metric.lines >= 300) {
    reasons.push(
      `${metric.path} has ${metric.lines} lines and should be checked for multiple responsibilities.`
    );
    impact = "medium";
  } else if (metric.kind === "test" && metric.lines >= 600) {
    reasons.push(
      `${metric.path} has ${metric.lines} lines, which can make test intent hard to scan.`
    );
    impact = "medium";
  }

  if (metric.branch_count >= 90) {
    reasons.push(
      `${metric.path} has ${metric.branch_count} branch-like tokens, suggesting high control-flow density.`
    );
    impact = impact === "high" ? "high" : "medium";
    risk = "medium";
  }

  if (metric.duplicate_ratio >= 0.18 && metric.duplicate_lines >= 20) {
    reasons.push(
      `${metric.path} has repeated normalized lines that may hide copy-pasted logic.`
    );
    impact = impact === "low" ? "medium" : impact;
  }

  if (metric.export_count >= 10 || metric.function_like_count >= 25) {
    reasons.push(
      `${metric.path} exposes or defines many units; it may be carrying too many responsibilities.`
    );
    impact = impact === "low" ? "medium" : impact;
  }

  if (metric.todo_count >= 3) {
    reasons.push(
      `${metric.path} contains ${metric.todo_count} TODO/FIXME/HACK markers.`
    );
    impact = impact === "low" ? "medium" : impact;
  }

  if (metric.long_lines >= 12) {
    reasons.push(
      `${metric.path} has ${metric.long_lines} lines over 120 characters, reducing scanability.`
    );
    impact = impact === "low" ? "medium" : impact;
  }

  if (metric.vague_name_count >= 5) {
    reasons.push(
      `${metric.path} has repeated vague naming signals often seen in rushed or vibecoded code.`
    );
    impact = impact === "low" ? "medium" : impact;
  }

  if (!reasons.length) {
    return hotspots;
  }

  hotspots.push({
    id: `file.${slug(metric.path)}`,
    type: "file",
    target: metric.path,
    title: `Simplify ${metric.path}`,
    reasons,
    suggested_action: suggestedActionForMetric(metric),
    payoff: impact,
    risk,
    confidence: "likely",
    evidence: [
      `${metric.path}: ${metric.lines} lines`,
      `${metric.path}: ${metric.function_like_count} function-like unit(s)`,
      `${metric.path}: ${metric.branch_count} branch-like token(s)`
    ]
  });

  return hotspots;
}

export function detectRepeatedFileFamilies(metrics) {
  const groups = new Map();
  for (const metric of metrics) {
    if (!["source", "config"].includes(metric.kind)) {
      continue;
    }
    const dir = path.posix.dirname(metric.path);
    const key = `${dir}:${metric.extension || metric.basename}`;
    const items = groups.get(key) || [];
    items.push(metric);
    groups.set(key, items);
  }

  const hotspots = [];
  for (const items of groups.values()) {
    if (items.length < 4) {
      continue;
    }
    const average =
      items.reduce((sum, item) => sum + item.lines, 0) / items.length;
    const similar = items.filter(
      (item) =>
        Math.abs(item.lines - average) <= Math.max(8, average * 0.35)
    );
    if (similar.length < 4) {
      continue;
    }
    const directory = path.posix.dirname(similar[0].path);
    const extension = similar[0].extension || similar[0].basename;
    hotspots.push({
      id: `family.${slug(directory)}.${slug(extension)}`,
      type: "repeated-family",
      target: directory,
      title: `Consolidate repeated file pattern in ${directory}`,
      reasons: [
        `${similar.length} similarly sized ${extension} files were found in the same directory.`,
        "This is a good candidate for a manifest, generator, shared helper, or documented pattern."
      ],
      suggested_action: "Create one source of truth for the repeated pattern, then regenerate or simplify the individual files.",
      payoff: "medium",
      risk: "medium",
      confidence: "likely",
      evidence: similar
        .slice(0, 8)
        .map((item) => `${item.path}: ${item.lines} lines`)
    });
  }
  return hotspots;
}

export function deadCodeHotspots(metrics, state) {
  const entrypointPaths = new Set([
    ...state.important_files.map((file) => file.path),
    ...Object.values(state.commands)
      .flat()
      .map((command) => command.detail)
      .filter(Boolean)
      .map((detail) => String(detail).replace(/^\.\//, ""))
  ]);
  const candidates = metrics.filter(
    (metric) =>
      metric.kind === "source" &&
      metric.reference_count === 0 &&
      !entrypointPaths.has(metric.path) &&
      !TEST_PATH.test(metric.path) &&
      !TEST_NAME.test(metric.path)
  );

  return candidates.slice(0, 6).map((metric) => ({
    id: `dead-code.${slug(metric.path)}`,
    type: "dead-code-candidate",
    target: metric.path,
    title: `Verify whether ${metric.path} is dead code`,
    reasons: [
      "No text references to this file stem were found outside the file itself.",
      "This is a deletion candidate only after user confirmation and test verification."
    ],
    suggested_action: "Ask the user before deleting; then remove only if imports, tests, docs, and runtime paths stay clean.",
    payoff: "low",
    risk: "high",
    confidence: "likely",
    evidence: [
      `${metric.path}: 0 text reference(s) to file stem outside itself`
    ]
  }));
}

export function rankHotspots(hotspots) {
  return hotspots
    .slice()
    .sort((a, b) => {
      const payoff = IMPACT_WEIGHT[b.payoff] - IMPACT_WEIGHT[a.payoff];
      if (payoff) {
        return payoff;
      }
      const risk = RISK_WEIGHT[b.risk] - RISK_WEIGHT[a.risk];
      if (risk) {
        return risk;
      }
      return a.target.localeCompare(b.target);
    });
}

function suggestedActionForMetric(metric) {
  if (metric.kind === "test") {
    return "Split broad test setup from focused assertions and name scenarios after behavior.";
  }
  if (metric.duplicate_ratio >= 0.18) {
    return "Extract repeated logic into a shared helper or small module after adding characterization coverage.";
  }
  if (metric.export_count >= 10 || metric.function_like_count >= 25) {
    return "Split the file by responsibility and keep public exports stable during the first pass.";
  }
  return "Make the file easier to scan by extracting focused helpers and reducing mixed responsibilities.";
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
