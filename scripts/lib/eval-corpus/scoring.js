export function scoreCase(item, analysis, policy) {
  const importantPredictions = unique(
    analysis.state.important_files
      .slice(0, policy.important_file_limit)
      .map((entry) => entry.path)
  );
  const runPredictions = commandPredictions(analysis.state.commands.run);
  const testPredictions = commandPredictions(analysis.state.commands.test);
  const dimensions = {
    important_files: scoreSet(importantPredictions, item.labels.important_files),
    run_command: scoreCommand(runPredictions, item.labels.run),
    test_command: scoreCommand(testPredictions, item.labels.test)
  };
  return {
    id: item.id,
    category: item.category,
    revision: item.revision,
    scan_complete: analysis.state.scan.complete,
    predictions: {
      important_files: importantPredictions,
      run: runPredictions,
      test: testPredictions
    },
    labels: item.labels,
    dimensions,
    totals: withMetrics(
      sumScores(Object.values(dimensions)),
      policy.false_positive_cost,
      policy.false_negative_cost
    )
  };
}

export function aggregateScores(results, policy) {
  const dimensions = {};
  for (const name of ["important_files", "run_command", "test_command"]) {
    dimensions[name] = withMetrics(
      sumScores(results.map((result) => result.dimensions[name])),
      policy.false_positive_cost,
      policy.false_negative_cost
    );
  }
  const totals = withMetrics(
    sumScores(results.map((result) => result.totals)),
    policy.false_positive_cost,
    policy.false_negative_cost
  );
  const weightedErrorPerCase = results.length
    ? totals.weighted_error / results.length
    : Number.POSITIVE_INFINITY;
  const failures = [];
  if (totals.precision < policy.minimum_precision) {
    failures.push(
      `precision ${formatRate(totals.precision)} is below ${formatRate(policy.minimum_precision)}`
    );
  }
  if (totals.recall < policy.minimum_recall) {
    failures.push(
      `recall ${formatRate(totals.recall)} is below ${formatRate(policy.minimum_recall)}`
    );
  }
  if (weightedErrorPerCase > policy.maximum_weighted_error_per_case) {
    failures.push(
      `weighted error/case ${weightedErrorPerCase.toFixed(2)} exceeds ${policy.maximum_weighted_error_per_case.toFixed(2)}`
    );
  }
  return {
    case_count: results.length,
    policy,
    dimensions,
    totals: { ...totals, weighted_error_per_case: weightedErrorPerCase },
    passed: failures.length === 0,
    failures
  };
}

function commandPredictions(commands) {
  return unique(
    commands.map((item) => ({
      cwd: normalizeCwd(item.cwd),
      command: normalizeCommand(item.command)
    })),
    commandKey
  );
}

function scoreSet(predicted, expected) {
  const predictedSet = new Set(predicted);
  const expectedSet = new Set(expected);
  const matched = predicted.filter((value) => expectedSet.has(value));
  const falsePositives = predicted.filter((value) => !expectedSet.has(value));
  const falseNegatives = expected.filter((value) => !predictedSet.has(value));
  return {
    tp: matched.length,
    fp: falsePositives.length,
    fn: falseNegatives.length,
    matched,
    false_positives: falsePositives,
    false_negatives: falseNegatives
  };
}

function scoreCommand(predicted, expected) {
  const normalizedExpected = expected
    ? {
        cwd: normalizeCwd(expected.cwd),
        command: normalizeCommand(expected.command)
      }
    : null;
  const expectedKey = normalizedExpected ? commandKey(normalizedExpected) : null;
  const matched = expectedKey
    ? predicted.filter((value) => commandKey(value) === expectedKey)
    : [];
  const falsePositives = predicted.filter(
    (value) => commandKey(value) !== expectedKey
  );
  return {
    tp: matched.length > 0 ? 1 : 0,
    fp: falsePositives.length,
    fn: normalizedExpected && matched.length === 0 ? 1 : 0,
    matched,
    false_positives: falsePositives,
    false_negatives:
      normalizedExpected && matched.length === 0 ? [normalizedExpected] : []
  };
}

function sumScores(scores) {
  return scores.reduce(
    (total, score) => ({
      tp: total.tp + score.tp,
      fp: total.fp + score.fp,
      fn: total.fn + score.fn
    }),
    { tp: 0, fp: 0, fn: 0 }
  );
}

function withMetrics(score, falsePositiveCost, falseNegativeCost) {
  const predicted = score.tp + score.fp;
  const expected = score.tp + score.fn;
  return {
    ...score,
    precision: predicted > 0 ? score.tp / predicted : expected === 0 ? 1 : 0,
    recall: expected > 0 ? score.tp / expected : 1,
    weighted_error:
      falsePositiveCost * score.fp + falseNegativeCost * score.fn
  };
}

function normalizeCommand(command) {
  return String(command || "").trim().replace(/\s+/g, " ");
}

function normalizeCwd(cwd) {
  const normalized = String(cwd || ".")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  return normalized || ".";
}

function commandKey(value) {
  return `${value.cwd}\u0000${value.command}`;
}

function unique(values, key = (value) => value) {
  const seen = new Set();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}

function formatRate(value) {
  return `${(value * 100).toFixed(1)}%`;
}
