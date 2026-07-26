import { safeTerminalText } from "../../../src/trust.js";

export function renderCorpusReport(run) {
  const { summary } = run;
  const role = run.corpus.evaluation_role;
  const lines = [
    `Kanon corpus: ${summary.case_count}/${summary.expected_case_count} cases`,
    `Evaluation role: ${role}`,
    `Generated: ${run.generated_at}`,
    `Corpus SHA-256: ${run.corpus.manifest_sha256 || "unknown"}`,
    `Analyzer: ${run.analyzer.version} (${run.analyzer.source})`,
    `Runtime: Node ${run.environment.node}, ${run.environment.os}/${run.environment.architecture}`
  ];
  if (run.candidate) {
    lines.push(
      `Candidate: v${run.candidate.version} at ${
        run.candidate.commit || "unresolved"
      } (worktree clean: ${String(run.candidate.worktree_clean)})`
    );
  }
  if (role === "release") {
    lines.push(
      `Artifact SHA-256: ${run.artifact.sha256 || "missing"}`,
      `Artifact conformance: ${
        run.artifact.conformance.passed ? "PASS" : "FAIL"
      }`
    );
  }
  lines.push(
    `Overall: ${formatMetrics(summary.totals)}`,
    `Important files: ${formatMetrics(summary.dimensions.important_files)}`,
    `Run commands: ${formatMetrics(summary.dimensions.run_command)}`,
    `Test commands: ${formatMetrics(summary.dimensions.test_command)}`,
    `Case-average: precision ${formatRate(summary.case_average.precision)}, recall ${formatRate(summary.case_average.recall)}`,
    `Macro over categories: precision ${formatRate(summary.macro_over_category.precision)}, recall ${formatRate(summary.macro_over_category.recall)}`,
    `Macro over dimensions: precision ${formatRate(summary.macro_over_dimension.precision)}, recall ${formatRate(summary.macro_over_dimension.recall)}`,
    "",
    "Coverage and abstentions:"
  );
  for (const dimension of [
    "important_files",
    "run_command",
    "test_command"
  ]) {
    lines.push(
      `- ${dimension}: coverage ${formatRate(summary.prediction_coverage[dimension])}, abstentions ${summary.abstentions[dimension]}`
    );
  }
  lines.push("", "Categories:");
  for (const [category, score] of Object.entries(summary.categories)) {
    lines.push(
      `- ${safeTerminalText(category)} (${score.case_count}): ${formatMetrics(score)}`
    );
  }

  const imperfect = run.results.filter(
    (result) =>
      result.analysis_error ||
      result.totals.fp > 0 ||
      result.totals.fn > 0
  );
  if (imperfect.length) {
    lines.push("", "Case details:");
  }
  for (const result of imperfect) {
    lines.push(
      `${safeTerminalText(result.id)}: TP ${result.totals.tp}, FP ${result.totals.fp}, FN ${result.totals.fn}`
    );
    if (result.analysis_error) {
      lines.push(
        `  analysis error: ${safeTerminalText(result.analysis_error.message)}`
      );
    }
    appendDimensionFailures(
      lines,
      "important",
      result.dimensions.important_files
    );
    appendDimensionFailures(
      lines,
      "run",
      result.dimensions.run_command
    );
    appendDimensionFailures(
      lines,
      "test",
      result.dimensions.test_command
    );
  }
  lines.push("");
  if (summary.passed) {
    lines.push(
      role === "release"
        ? "Release gate: PASS"
        : "Development thresholds: PASS (frozen compatibility sample only)"
    );
  } else {
    lines.push(
      role === "release"
        ? "Release gate: FAIL"
        : "Development thresholds: FAIL (frozen compatibility sample only)"
    );
    for (const failure of summary.failures) {
      lines.push(`- ${safeTerminalText(failure)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function formatMetrics(score) {
  return (
    `precision ${formatRate(score.precision)} ` +
    `${formatInterval(score.precision_interval)}, ` +
    `recall ${formatRate(score.recall)} ` +
    `${formatInterval(score.recall_interval)} ` +
    `(TP ${score.tp}, FP ${score.fp}, FN ${score.fn})`
  );
}

function formatInterval(interval) {
  return (
    `[95% ${formatRate(interval.lower)}–` +
    `${formatRate(interval.upper)}]`
  );
}

function formatRate(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function appendDimensionFailures(lines, label, score) {
  if (score.false_positives.length > 0) {
    lines.push(
      `  ${label} false positives: ${formatValues(score.false_positives)}`
    );
  }
  if (score.false_negatives.length > 0) {
    lines.push(
      `  ${label} misses: ${formatValues(score.false_negatives)}`
    );
  }
}

function formatValues(values) {
  return values
    .map((value) =>
      typeof value === "string"
        ? safeTerminalText(value)
        : safeTerminalText(
            `${value.cwd === "." ? "" : `${value.cwd}: `}${value.command}`
          )
    )
    .join(", ");
}
