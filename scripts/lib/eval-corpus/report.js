export function renderCorpusReport(run) {
  const { summary } = run;
  const lines = [
    `Kanon corpus: ${summary.case_count} pinned third-party repositories`,
    `Overall: precision ${formatRate(summary.totals.precision)}, recall ${formatRate(summary.totals.recall)}, weighted error ${summary.totals.weighted_error} (${summary.totals.weighted_error_per_case.toFixed(2)}/case)`,
    `Important files: ${formatDimension(summary.dimensions.important_files)}`,
    `Run commands: ${formatDimension(summary.dimensions.run_command)}`,
    `Test commands: ${formatDimension(summary.dimensions.test_command)}`,
    ""
  ];
  const imperfect = run.results.filter(
    (result) => result.totals.fp > 0 || result.totals.fn > 0
  );
  for (const result of imperfect) {
    lines.push(
      `${result.id}: TP ${result.totals.tp}, FP ${result.totals.fp}, FN ${result.totals.fn}`
    );
    appendDimensionFailures(lines, "important", result.dimensions.important_files);
    appendDimensionFailures(lines, "run", result.dimensions.run_command);
    appendDimensionFailures(lines, "test", result.dimensions.test_command);
  }
  lines.push("");
  if (summary.passed) {
    lines.push("Release gate: PASS");
  } else {
    lines.push("Release gate: FAIL");
    for (const failure of summary.failures) {
      lines.push(`- ${failure}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function formatRate(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDimension(score) {
  return `precision ${formatRate(score.precision)}, recall ${formatRate(score.recall)} (TP ${score.tp}, FP ${score.fp}, FN ${score.fn})`;
}

function appendDimensionFailures(lines, label, score) {
  if (score.false_positives.length > 0) {
    lines.push(
      `  ${label} false positives: ${formatValues(score.false_positives)}`
    );
  }
  if (score.false_negatives.length > 0) {
    lines.push(`  ${label} misses: ${formatValues(score.false_negatives)}`);
  }
}

function formatValues(values) {
  return values
    .map((value) =>
      typeof value === "string"
        ? value
        : `${value.cwd === "." ? "" : `${value.cwd}: `}${value.command}`
    )
    .join(", ");
}
