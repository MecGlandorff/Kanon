export function validateDevelopmentReport(run, options = {}) {
  const expectedCommit = options.candidateCommit;
  const expectedVersion = options.candidateVersion;
  const requireThresholdPass = options.requireThresholdPass === true;

  if (!run || run.corpus?.evaluation_role !== "development") {
    throw new Error("Expected a development-corpus report.");
  }
  if (
    run.corpus.selected_case_count !== run.corpus.total_case_count ||
    run.summary?.case_count !== run.summary?.expected_case_count ||
    run.results?.length !== run.summary?.expected_case_count
  ) {
    throw new Error("Development evaluation was partial.");
  }
  if (
    run.summary.analysis_error_count !== 0 ||
    run.results.some((result) => result.analysis_error)
  ) {
    throw new Error("Development evaluation contains analysis errors.");
  }
  if (
    expectedCommit &&
    (
      run.candidate?.commit !== expectedCommit ||
      run.candidate?.worktree_clean !== true
    )
  ) {
    throw new Error("Development evaluation candidate commit is not clean or does not match.");
  }
  if (
    expectedVersion &&
    (
      run.candidate?.version !== expectedVersion ||
      run.analyzer?.version !== expectedVersion
    )
  ) {
    throw new Error("Development evaluation candidate version does not match.");
  }
  if (requireThresholdPass && run.summary.passed !== true) {
    throw new Error("The complete development corpus did not pass its thresholds.");
  }

  return {
    execution_complete: true,
    thresholds_passed: run.summary.passed === true,
    analysis_error_count: run.summary.analysis_error_count,
    incomplete_scan_count: run.summary.incomplete_scan_count,
    failures: Array.isArray(run.summary.failures)
      ? [...run.summary.failures]
      : []
  };
}
