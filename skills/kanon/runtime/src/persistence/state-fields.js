const SCAN_FIELDS = [
  "complete",
  "strategy",
  "max_files",
  "max_entries",
  "max_file_bytes",
  "max_total_hash_bytes",
  "max_total_text_bytes",
  "max_elapsed_ms",
  "entries_visited",
  "total_bytes_hashed",
  "total_text_bytes_read",
  "elapsed_ms",
  "truncated",
  "unreadable_entries",
  "missing_tracked_files",
  "ignored_directories",
  "kanon_ignored_entries",
  "sensitive_files_skipped",
  "symlinks_skipped",
  "rejected_paths",
  "outside_root_paths",
  "path_failures",
  "path_failures_truncated",
  "budgets_reached",
  "git_observation_failed",
  "git_diagnostic"
];

export function validateCurrentStateFields(value) {
  return firstInvalid([
    record(value.repo, "repo", {
      name: string,
      root: string,
      languages: strings,
      files_scanned: nonnegativeInteger
    }),
    scan(value.scan),
    git(value.git),
    record(value.purpose, "purpose", {
      claim: string,
      confidence: confidence,
      evidence: strings
    }, { trust: string }),
    commands(value.commands),
    array(
      value.important_files,
      "important_files",
      (item, field) => record(item, field, {
        path: string,
        reason: string,
        fan_in: nonnegativeInteger,
        evidence: strings
      }, { trust: string })
    ),
    codeIntelligence(value.code_intelligence),
    tests(value.tests),
    signal(value.ci, "ci"),
    signal(value.deployment, "deployment"),
    signal(value.release, "release"),
    array(
      value.todos,
      "todos",
      (item, field) => record(item, field, {
        path: string,
        line: positiveInteger,
        text: string
      }, { trust: string })
    ),
    currentState(value.current_state),
    verification(value.verification),
    configuration(value.configuration),
    record(value.command_execution, "command_execution", {
      policy: (item) => enumValue(item, ["ask", "never"]),
      approval_required: boolean,
      execution_allowed: boolean,
      trust: string
    }),
    record(value.files, "files", {
      fingerprints: (items, field) => array(
        items,
        field,
        (item, itemField) => record(item, itemField, {
          path: string,
          size: nonnegativeInteger,
          sha256: nullableHash
        })
      )
    })
  ]);
}

function scan(value) {
  const rules = Object.fromEntries(
    SCAN_FIELDS.map((field) => [field, nonnegativeInteger])
  );
  Object.assign(rules, {
    complete: boolean,
    strategy: string,
    truncated: boolean,
    path_failures: (items, field) => array(
      items,
      field,
      (item, itemField) => record(item, itemField, {
        path: nullableString,
        status: string,
        code: string,
        reason: string
      })
    ),
    path_failures_truncated: boolean,
    budgets_reached: strings,
    git_observation_failed: boolean,
    git_diagnostic: nullableString
  });
  return record(value, "scan", rules);
}

function git(value) {
  return record(value, "git", {
    found: boolean,
    branch: nullableString,
    head: nullableString,
    dirty: nullableBoolean,
    change_count: nullableNonnegativeInteger,
    change_count_exact: boolean,
    changes: (items, field) => array(
      items,
      field,
      (item, itemField) => record(item, itemField, {
        path: string,
        index: string,
        worktree: string,
        trust: string
      })
    ),
    changes_truncated: boolean,
    sensitive_changes_skipped: nonnegativeInteger,
    recent_commits: (items, field) => array(
      items,
      field,
      (item, itemField) => record(item, itemField, {
        hash: string,
        date: string,
        subject: string,
        trust: string
      })
    ),
    observation_complete: boolean,
    diagnostics: (items, field) => array(
      items,
      field,
      (item, itemField) => record(item, itemField, {
        operation: string,
        kind: string,
        message: string
      }, {
        status: nullableInteger,
        signal: nullableString,
        timeout: boolean,
        overflow: boolean,
        stderr: string
      })
    ),
    trust: string,
    evidence: strings
  });
}

function commands(value) {
  const commandArray = (items, field) => array(
    items,
    field,
    (item, itemField) => record(item, itemField, {
      command: string,
      cwd: string,
      source: string,
      confidence: confidence,
      evidence: strings
    }, {
      detail: nullableString,
      trust: string
    })
  );
  return record(value, "commands", {
    run: commandArray,
    test: commandArray,
    build: commandArray,
    dev: commandArray
  });
}

function codeIntelligence(value) {
  return record(value, "code_intelligence", {
    files_with_inbound_imports: nonnegativeInteger,
    entrypoints: (items, field) => array(
      items,
      field,
      (item, itemField) => record(item, itemField, {
        path: string,
        confidence: confidence,
        reason: string
      })
    ),
    top_fan_in: (items, field) => array(
      items,
      field,
      (item, itemField) => record(item, itemField, {
        path: string,
        fan_in: nonnegativeInteger
      })
    )
  });
}

function tests(value) {
  return record(value, "tests", {
    found: boolean,
    files: strings,
    count: nonnegativeInteger,
    frameworks: strings,
    evidence: strings
  });
}

function signal(value, field) {
  return record(value, field, {
    found: boolean,
    files: (items, itemsField) => array(
      items,
      itemsField,
      (item, itemField) => record(item, itemField, {
        path: string,
        evidence: string
      })
    )
  });
}

function currentState(value) {
  const claims = (items, field) => array(
    items,
    field,
    (item, itemField) => record(item, itemField, {
      claim: string
    }, {
      reason: string,
      evidence: strings,
      trust: string,
      confidence: confidence
    })
  );
  return record(value, "current_state", {
    known: claims,
    likely: claims,
    unknown: claims,
    stale_suspicious: claims,
    suggested: claims
  });
}

function verification(value) {
  const observations = (items, field) => array(
    items,
    field,
    (item, itemField) => record(item, itemField, {
      type: string,
      severity: string,
      conclusion: string,
      claim: string,
      observation: string,
      evidence: strings
    }, { suggestion: string })
  );
  return record(value, "verification", {
    target: string,
    checked: boolean,
    applicable: boolean,
    scan_complete: boolean,
    issues: observations,
    unknowns: observations
  }, {
    note: string,
    commands_checked: nonnegativeInteger
  });
}

function configuration(value) {
  return record(value, "configuration", {
    found: boolean,
    valid: boolean,
    warning: nullableString,
    invalid_field: nullableString,
    command_execution: (item) => enumValue(item, ["ask", "never"]),
    evidence: strings
  });
}

function record(value, field, required, optional = {}) {
  if (!plainObject(value)) {
    return invalid(field, "Expected an object.");
  }
  const allowed = new Set([
    ...Object.keys(required),
    ...Object.keys(optional)
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      return invalid(`${field}.${key}`, "Unknown field.");
    }
  }
  for (const [key, validator] of Object.entries(required)) {
    if (!Object.hasOwn(value, key)) {
      return invalid(`${field}.${key}`, "Missing required field.");
    }
    const issue = validator(value[key], `${field}.${key}`);
    if (issue) return issue;
  }
  for (const [key, validator] of Object.entries(optional)) {
    if (Object.hasOwn(value, key)) {
      const issue = validator(value[key], `${field}.${key}`);
      if (issue) return issue;
    }
  }
  return null;
}

function array(value, field, validator) {
  if (!Array.isArray(value)) {
    return invalid(field, "Expected an array.");
  }
  for (let index = 0; index < value.length; index += 1) {
    const issue = validator(value[index], `${field}[${index}]`);
    if (issue) return issue;
  }
  return null;
}

function strings(value, field) {
  return array(value, field, string);
}

function string(value, field) {
  return typeof value === "string"
    ? null
    : invalid(field, "Expected a string.");
}

function boolean(value, field) {
  return typeof value === "boolean"
    ? null
    : invalid(field, "Expected a boolean.");
}

function confidence(value, field) {
  return enumValue(value, ["known", "likely", "unknown"], field);
}

function enumValue(value, values, field = "value") {
  return values.includes(value)
    ? null
    : invalid(field, `Expected one of: ${values.join(", ")}.`);
}

function nonnegativeInteger(value, field) {
  return Number.isInteger(value) && value >= 0
    ? null
    : invalid(field, "Expected a nonnegative integer.");
}

function positiveInteger(value, field) {
  return Number.isInteger(value) && value > 0
    ? null
    : invalid(field, "Expected a positive integer.");
}

function nullableString(value, field) {
  return value === null ? null : string(value, field);
}

function nullableBoolean(value, field) {
  return value === null ? null : boolean(value, field);
}

function nullableInteger(value, field) {
  return value === null || Number.isInteger(value)
    ? null
    : invalid(field, "Expected an integer or null.");
}

function nullableNonnegativeInteger(value, field) {
  return value === null ? null : nonnegativeInteger(value, field);
}

function nullableHash(value, field) {
  return value === null || /^[0-9a-f]{64}$/.test(value)
    ? null
    : invalid(field, "Expected a lowercase SHA-256 or null.");
}

function plainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function invalid(field, reason) {
  return { valid: false, field, reason };
}

function firstInvalid(issues) {
  return issues.find(Boolean) || { valid: true, field: null, reason: null };
}
