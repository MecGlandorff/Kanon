import { DIMENSIONS, REQUIRED_CATEGORIES } from "./schema.js";
import { expectedCommandEntries } from "./schema-labels.js";
import {
  average,
  sumScores,
  withMetrics
} from "./metrics.js";

export function scoreCase(item, analysis, policy) {
  const importantPredictions = unique(
    analysis.state.important_files
      .slice(0, policy.important_file_limit)
      .map((entry) => entry.path)
  );
  const runPredictions = commandPredictions(
    analysis.state.commands.run
  );
  const testPredictions = commandPredictions(
    analysis.state.commands.test
  );
  const dimensions = {
    important_files: scoreSet(
      importantPredictions,
      item.labels.important_files.map((label) => label.path)
    ),
    run_command: scoreCommand(
      runPredictions,
      expectedCommandEntries(item.labels.run)
    ),
    test_command: scoreCommand(
      testPredictions,
      expectedCommandEntries(item.labels.test)
    )
  };
  return buildCaseResult(
    item,
    analysis.state.scan,
    {
      important_files: importantPredictions,
      run: runPredictions,
      test: testPredictions
    },
    dimensions,
    policy,
    null
  );
}

export function scoreErrorCase(item, error, policy) {
  const dimensions = {
    important_files: scoreSet(
      [],
      item.labels.important_files.map((label) => label.path)
    ),
    run_command: scoreCommand(
      [],
      expectedCommandEntries(item.labels.run)
    ),
    test_command: scoreCommand(
      [],
      expectedCommandEntries(item.labels.test)
    )
  };
  return buildCaseResult(
    item,
    { complete: false },
    { important_files: [], run: [], test: [] },
    dimensions,
    policy,
    {
      name: error?.name || "Error",
      message: String(error?.message || error).slice(0, 2_000)
    }
  );
}

export function aggregateScores(results, policy, options = {}) {
  const dimensions = Object.fromEntries(
    DIMENSIONS.map((name) => [
      name,
      withMetrics(
        sumScores(results.map((result) => result.dimensions[name])),
        policy.false_positive_cost,
        policy.false_negative_cost
      )
    ])
  );
  const totals = withMetrics(
    sumScores(results.map((result) => result.totals)),
    policy.false_positive_cost,
    policy.false_negative_cost
  );
  const categories = aggregateCategories(results, policy);
  const weightedErrorPerCase = results.length
    ? totals.weighted_error / results.length
    : Number.POSITIVE_INFINITY;
  const caseMetrics = results.map((result) => result.totals);
  const failures = [];
  applyThresholds(failures, "overall", totals, policy);
  if (
    weightedErrorPerCase >
    policy.maximum_weighted_error_per_case
  ) {
    failures.push(
      `weighted error/case ${weightedErrorPerCase.toFixed(2)} exceeds ${policy.maximum_weighted_error_per_case.toFixed(2)}`
    );
  }
  for (const [name, score] of Object.entries(dimensions)) {
    applyThresholds(
      failures,
      name,
      score,
      policy.dimension_thresholds[name]
    );
  }
  for (const category of REQUIRED_CATEGORIES) {
    const score = categories[category];
    if (!score) {
      failures.push(`category ${category} did not execute`);
      continue;
    }
    if (score.case_count < policy.minimum_cases_per_category) {
      failures.push(
        `category ${category} executed ${score.case_count} cases; ${policy.minimum_cases_per_category} required`
      );
    }
    applyThresholds(
      failures,
      `category ${category}`,
      score,
      policy.category_thresholds[category]
    );
  }
  const expectedCaseCount = options.expectedCaseCount ?? results.length;
  if (results.length !== expectedCaseCount) {
    failures.push(
      `partial execution: ${results.length} of ${expectedCaseCount} cases produced results`
    );
  }
  const errors = results.filter((result) => result.analysis_error);
  if (errors.length) {
    failures.push(`${errors.length} case analysis error(s) occurred`);
  }
  const incomplete = results.filter((result) => !result.scan_complete);
  if (options.requireCompleteScans && incomplete.length) {
    failures.push(`${incomplete.length} case scan(s) were incomplete`);
  }

  return {
    case_count: results.length,
    expected_case_count: expectedCaseCount,
    policy,
    dimensions,
    totals: {
      ...totals,
      weighted_error_per_case: weightedErrorPerCase
    },
    case_average: {
      precision: average(caseMetrics.map((result) => result.precision)),
      recall: average(caseMetrics.map((result) => result.recall))
    },
    macro_over_category: macroMetrics(Object.values(categories)),
    macro_over_dimension: macroMetrics(Object.values(dimensions)),
    categories,
    abstentions: aggregateAbstentions(results),
    prediction_coverage: aggregateCoverage(results),
    analysis_error_count: errors.length,
    incomplete_scan_count: incomplete.length,
    passed: failures.length === 0,
    failures
  };
}

function buildCaseResult(
  item,
  scan,
  predictions,
  dimensions,
  policy,
  analysisError
) {
  return {
    id: item.id,
    category: item.category,
    revision: item.revision,
    scan_complete: scan.complete === true,
    scan_diagnostics: scan,
    analysis_error: analysisError,
    predictions,
    labels: item.labels,
    abstentions: {
      important_files: predictions.important_files.length === 0,
      run_command: predictions.run.length === 0,
      test_command: predictions.test.length === 0
    },
    dimensions,
    totals: withMetrics(
      sumScores(Object.values(dimensions)),
      policy.false_positive_cost,
      policy.false_negative_cost
    )
  };
}

function aggregateCategories(results, policy) {
  return Object.fromEntries(
    REQUIRED_CATEGORIES.flatMap((category) => {
      const grouped = results.filter(
        (result) => result.category === category
      );
      if (!grouped.length) {
        return [];
      }
      return [[
        category,
        {
          case_count: grouped.length,
          ...withMetrics(
            sumScores(grouped.map((result) => result.totals)),
            policy.false_positive_cost,
            policy.false_negative_cost
          )
        }
      ]];
    })
  );
}

function applyThresholds(failures, label, score, thresholds) {
  if (score.precision < thresholds.minimum_precision) {
    failures.push(
      `${label} precision ${formatRate(score.precision)} is below ${formatRate(thresholds.minimum_precision)}`
    );
  }
  if (score.recall < thresholds.minimum_recall) {
    failures.push(
      `${label} recall ${formatRate(score.recall)} is below ${formatRate(thresholds.minimum_recall)}`
    );
  }
}

function macroMetrics(scores) {
  return {
    precision: average(scores.map((score) => score.precision)),
    recall: average(scores.map((score) => score.recall))
  };
}

function aggregateAbstentions(results) {
  return Object.fromEntries(
    DIMENSIONS.map((name) => [
      name,
      results.filter((result) => result.abstentions[name]).length
    ])
  );
}

function aggregateCoverage(results) {
  return Object.fromEntries(
    DIMENSIONS.map((name) => [
      name,
      results.length
        ? 1 - (
          results.filter((result) => result.abstentions[name]).length /
          results.length
        )
        : 0
    ])
  );
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
  return {
    tp: predicted.filter((value) => expectedSet.has(value)).length,
    fp: predicted.filter((value) => !expectedSet.has(value)).length,
    fn: expected.filter((value) => !predictedSet.has(value)).length,
    matched: predicted.filter((value) => expectedSet.has(value)),
    false_positives: predicted.filter((value) => !expectedSet.has(value)),
    false_negatives: expected.filter((value) => !predictedSet.has(value))
  };
}

function scoreCommand(predicted, accepted) {
  const expectedKeys = new Set(
    accepted.map((value) => commandKey({
      cwd: normalizeCwd(value.cwd),
      command: normalizeCommand(value.command)
    }))
  );
  const matched = predicted.filter((value) =>
    expectedKeys.has(commandKey(value))
  );
  const falsePositives = predicted.filter((value) =>
    !expectedKeys.has(commandKey(value))
  );
  return {
    tp: matched.length ? 1 : 0,
    fp: falsePositives.length,
    fn: accepted.length && !matched.length ? 1 : 0,
    matched,
    false_positives: falsePositives,
    false_negatives:
      accepted.length && !matched.length ? accepted : []
  };
}

function normalizeCommand(command) {
  return String(command || "").trim().replace(/\s+/g, " ");
}

function normalizeCwd(cwd) {
  return String(cwd || ".")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+$/, "") || ".";
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
