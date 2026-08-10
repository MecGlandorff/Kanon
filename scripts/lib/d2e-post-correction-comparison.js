import {
  canonicalJson,
  semanticReportProjection,
  sha256
} from "./d2e-evidence.js";

export const POST_CORRECTION_CLASSIFICATIONS = Object.freeze({
  direct: "direct authorized exclusion",
  displacement: "deterministic downstream displacement",
  provenance: "protocol-permitted provenance variation",
  unexpected: "unexpected",
  unchanged: "unchanged"
});

const PACKAGE_STAGE = "package-declarations";
const PACKAGE_STAGE_ORDINAL = 9;
const MANIFEST_STAGE = "manifest-entrypoints";
const FINAL_STAGE = "final-cap";

/**
 * Compare the immutable recovered trace with one validated post-correction
 * attempt. Inputs are already schema-, inventory-, containment-, and
 * hash-validated by d2e-post-correction.js.
 *
 * Candidate evidence uses compact tuples so every one of the 30-case
 * candidates remains individually bound without copying repository data:
 *
 *   unchanged: [candidate_id, canonical_value_sha256]
 *   changed:   [candidate_id, pre_sha256, post_sha256, classification,
 *               normalized_path, difference_paths, pre_selected,
 *               post_selected, label_status]
 *
 * @param {{
 *   authority: Record<string, unknown>,
 *   attempt: Record<string, unknown>,
 *   before: {
 *     report: Record<string, unknown>,
 *     traces: Record<string, unknown>[],
 *     trace_set_sha256: string
 *   },
 *   d2a: Record<string, unknown>,
 *   integrity: Record<string, unknown>
 * }} input
 */
export function buildPostCorrectionComparison(input) {
  const authority = input.authority;
  const before = input.before;
  const after = input.attempt;
  requireCondition(
    Array.isArray(before.traces) &&
      before.traces.length === 30 &&
      Array.isArray(after.traces) &&
      after.traces.length === 30 &&
      Array.isArray(before.report?.results) &&
      before.report.results.length === 30 &&
      Array.isArray(after.report?.results) &&
      after.report.results.length === 30 &&
      Array.isArray(input.d2a?.results) &&
      input.d2a.results.length === 30,
    "comparison-case-inventory"
  );

  const cases = [];
  const totals = {
    candidates: 0,
    direct_authorized_exclusions: 0,
    deterministic_downstream_displacements: 0,
    protocol_permitted_provenance_variations: 0,
    unexpected_differences: 0,
    unchanged_candidates: 0,
    intrinsic_candidate_changes: 0,
    manifest_entrypoint_controls: 0,
    manifest_entrypoint_control_changes: 0,
    directly_excluded_labeled_paths: 0,
    directly_excluded_true_positives: 0,
    added_false_negatives: 0,
    new_public_false_positives: 0,
    removed_public_false_positives: 0,
    public_additions: 0,
    public_removals: 0
  };
  let rawMembershipExact = true;
  let stageStructureExact = true;
  let directBoundaryExact = true;
  let manifestControlsExact = true;
  let intrinsicExact = true;
  let publicChangesExplained = true;
  let unchangedPublicFieldsExact = true;
  let d2aBaselineExact = true;

  for (let index = 0; index < 30; index += 1) {
    const ordinal = index + 1;
    const preTrace = before.traces[index];
    const postTrace = after.traces[index];
    const preResult = before.report.results[index];
    const postResult = after.report.results[index];
    const d2aResult = input.d2a.results[index];
    requireCondition(
      preTrace?.case?.ordinal === ordinal &&
        postTrace?.case?.ordinal === ordinal &&
        preTrace.case.id === postTrace.case.id &&
        preTrace.case.revision === postTrace.case.revision &&
        preResult?.id === preTrace.case.id &&
        postResult?.id === postTrace.case.id &&
        d2aResult?.id === preTrace.case.id &&
        preResult.revision === preTrace.case.revision &&
        postResult.revision === preTrace.case.revision &&
        d2aResult.revision === preTrace.case.revision,
      `comparison-case-identity-${ordinal}`
    );

    const preMembership = preTrace.candidates.map(candidateIdentity);
    const postMembership = postTrace.candidates.map(candidateIdentity);
    const membershipEqual =
      canonicalJson(preMembership) === canonicalJson(postMembership);
    rawMembershipExact &&= membershipEqual;

    const labels = new Set(
      (preResult.labels?.important_files || []).map((item) => item.path)
    );
    const preMatched = new Set(
      preResult.dimensions?.important_files?.matched || []
    );
    const directIds = new Set();
    const displacementIds = new Set();
    const unexpectedIds = new Set();
    const candidateEvidence = [];
    let manifestControlCount = 0;
    let manifestControlChanges = 0;
    let intrinsicChanges = 0;

    requireCondition(
      preTrace.candidates.length === postTrace.candidates.length,
      `comparison-candidate-count-${ordinal}`
    );
    for (
      let candidateIndex = 0;
      candidateIndex < preTrace.candidates.length;
      candidateIndex += 1
    ) {
      const preCandidate = preTrace.candidates[candidateIndex];
      const postCandidate = postTrace.candidates[candidateIndex];
      requireCondition(
        preCandidate.candidate_id === postCandidate.candidate_id &&
          preCandidate.normalized_path ===
            postCandidate.normalized_path,
        `comparison-candidate-identity-${ordinal}-${candidateIndex + 1}`
      );
      const preHash = valueSha256(preCandidate);
      const postHash = valueSha256(postCandidate);
      const manifestPre = visitFor(preCandidate, MANIFEST_STAGE);
      const manifestPost = visitFor(postCandidate, MANIFEST_STAGE);
      if (manifestPre || manifestPost) {
        manifestControlCount += 1;
        if (canonicalJson(manifestPre) !== canonicalJson(manifestPost)) {
          manifestControlChanges += 1;
        }
      }

      if (preHash === postHash) {
        candidateEvidence.push([
          preCandidate.candidate_id,
          preHash
        ]);
        totals.unchanged_candidates += 1;
        continue;
      }

      const classified = classifyCandidateDifference(
        preCandidate,
        postCandidate
      );
      const isLabeled = labels.has(preCandidate.normalized_path);
      const wasTruePositive =
        isLabeled &&
        preCandidate.final?.selected === true &&
        preMatched.has(preCandidate.normalized_path);
      const labelStatus = wasTruePositive
        ? "pre-selected-true-positive"
        : isLabeled
          ? "labeled-not-pre-selected"
          : "unlabeled";
      candidateEvidence.push([
        preCandidate.candidate_id,
        preHash,
        postHash,
        classified.classification,
        preCandidate.normalized_path,
        classified.difference_paths,
        preCandidate.final?.selected === true,
        postCandidate.final?.selected === true,
        labelStatus
      ]);
      if (!classified.intrinsic_equal) {
        intrinsicChanges += 1;
      }
      if (
        classified.classification ===
        POST_CORRECTION_CLASSIFICATIONS.direct
      ) {
        directIds.add(preCandidate.candidate_id);
        if (isLabeled) {
          totals.directly_excluded_labeled_paths += 1;
        }
        if (
          wasTruePositive &&
          postCandidate.final?.selected !== true
        ) {
          totals.directly_excluded_true_positives += 1;
        }
      } else if (
        classified.classification ===
        POST_CORRECTION_CLASSIFICATIONS.displacement
      ) {
        displacementIds.add(preCandidate.candidate_id);
      } else {
        unexpectedIds.add(preCandidate.candidate_id);
      }
    }

    const stageComparison = compareStages(
      preTrace.stages,
      postTrace.stages,
      preTrace.candidates,
      postTrace.candidates,
      directIds,
      displacementIds
    );
    stageStructureExact &&= stageComparison.static_structure_exact;
    directBoundaryExact &&= stageComparison.direct_boundary_exact;
    manifestControlsExact &&=
      stageComparison.manifest_entrypoints_exact &&
      manifestControlChanges === 0;
    intrinsicExact &&= intrinsicChanges === 0;

    const invariants = compareCaseInvariants(
      preTrace,
      postTrace,
      preResult,
      postResult
    );
    unchangedPublicFieldsExact &&= invariants.all_exact;

    const publicEffects = comparePublicEffects({
      preResult,
      postResult,
      preTrace,
      postTrace,
      directIds,
      displacementIds
    });
    publicChangesExplained &&= publicEffects.explained;

    const historicalPre = caseHistoricalProjection(preResult);
    const historicalPost = caseHistoricalProjection(postResult);
    const historicalD2a = caseHistoricalProjection(d2aResult);
    const preD2aExact =
      canonicalJson(historicalPre) === canonicalJson(historicalD2a);
    d2aBaselineExact &&= preD2aExact;

    totals.candidates += preTrace.candidates.length;
    totals.direct_authorized_exclusions += directIds.size;
    totals.deterministic_downstream_displacements +=
      displacementIds.size;
    totals.unexpected_differences += unexpectedIds.size;
    totals.intrinsic_candidate_changes += intrinsicChanges;
    totals.manifest_entrypoint_controls += manifestControlCount;
    totals.manifest_entrypoint_control_changes +=
      manifestControlChanges;
    totals.added_false_negatives +=
      publicEffects.added_false_negatives.length;
    totals.new_public_false_positives +=
      publicEffects.new_false_positives.length;
    totals.removed_public_false_positives +=
      publicEffects.removed_false_positives.length;
    totals.public_additions += publicEffects.added.length;
    totals.public_removals += publicEffects.removed.length;
    totals.protocol_permitted_provenance_variations +=
      invariants.provenance_variations.length;

    cases.push({
      candidate_counts: {
        direct_authorized_exclusion: directIds.size,
        deterministic_downstream_displacement:
          displacementIds.size,
        intrinsic_changes: intrinsicChanges,
        manifest_entrypoint_controls: manifestControlCount,
        unexpected: unexpectedIds.size,
        unchanged:
          preTrace.candidates.length -
          directIds.size -
          displacementIds.size -
          unexpectedIds.size
      },
      candidate_evidence: candidateEvidence,
      historical_d2a: {
        post_difference_paths: differencePaths(
          historicalD2a,
          historicalPost
        ),
        post_projection_sha256: valueSha256(historicalPost),
        pre_exact: preD2aExact,
        pre_projection_sha256: valueSha256(historicalPre),
        d2a_projection_sha256: valueSha256(historicalD2a)
      },
      id: preTrace.case.id,
      invariants,
      ordinal,
      public_effects: publicEffects,
      raw_candidate_membership: {
        count: preMembership.length,
        exact: membershipEqual,
        post_sha256: valueSha256(postMembership),
        pre_sha256: valueSha256(preMembership)
      },
      revision: preTrace.case.revision,
      scores: caseScoreEvidence(preResult, postResult),
      stages: stageComparison,
      trace_sha256: {
        post: valueSha256(postTrace),
        pre: valueSha256(preTrace)
      }
    });
  }

  const aggregateScores = aggregateScoreEvidence(
    before.report,
    after.report
  );
  const protocolGates = unchangedProtocolGates(
    before.report,
    after.report,
    input.integrity
  );
  const effectsComplete =
    rawMembershipExact &&
    stageStructureExact &&
    d2aBaselineExact &&
    cases.every(
      (item) =>
        item.candidate_evidence.length ===
        item.raw_candidate_membership.count
    );
  const supportedConditions = [
    after.report.results.length === 30 &&
      after.traces.length === 30 &&
      after.manifest?.case_count === 30,
    input.integrity?.passed === true,
    after.manifest?.observer_failure_count === 0,
    after.manifest?.trace_on_off_equivalence?.exact === true,
    rawMembershipExact,
    directBoundaryExact &&
      totals.unexpected_differences === 0 &&
      totals.intrinsic_candidate_changes === 0,
    manifestControlsExact,
    intrinsicExact,
    publicChangesExplained &&
      totals.unexpected_differences === 0,
    unchangedPublicFieldsExact,
    totals.directly_excluded_true_positives === 0,
    totals.added_false_negatives === 0,
    aggregateScores.recall_non_decreasing,
    totals.new_public_false_positives === 0,
    totals.removed_public_false_positives > 0,
    aggregateScores.precision_non_decreasing,
    protocolGates.passed
  ];
  requireCondition(
    Array.isArray(
      authority?.decision_conditions?.correction_supported
    ) &&
      authority.decision_conditions.correction_supported.length ===
        supportedConditions.length,
    "comparison-authority-gate-count"
  );
  const decisionGates =
    authority.decision_conditions.correction_supported.map(
      (condition, index) => ({
        condition,
        passed: supportedConditions[index]
      })
    );
  const allSupported = decisionGates.every((item) => item.passed);
  const conclusion = effectsComplete
    ? allSupported
      ? "correction-supported"
      : "correction-not-supported"
    : "inconclusive";

  return {
    aggregate: {
      counts: totals,
      scores: aggregateScores
    },
    attempt: {
      complete_tree_sha256: after.inventory?.sha256 || null,
      consumption: after.consumption,
      source_commit: after.binding?.source_commit || null,
      trace_set_sha256: after.manifest?.trace_set_sha256 || null
    },
    authority_sha256:
      "b4227670b7b831f1949598add2fa538c875cdb90ab55b1820a35ba81b5543087",
    baselines: {
      d2a_semantic_projection_sha256: valueSha256(
        semanticReportProjection(input.d2a)
      ),
      pre_correction_report_projection_sha256: valueSha256(
        semanticReportProjection(before.report)
      ),
      pre_correction_trace_set_sha256:
        before.trace_set_sha256,
      pre_d2a_historically_available_fields_exact:
        d2aBaselineExact,
      scan_diagnostic_equivalence_with_d2a:
        "not-established-by-authority"
    },
    candidate_evidence_encoding: {
      changed: [
        "candidate_id",
        "pre_canonical_value_sha256",
        "post_canonical_value_sha256",
        "classification",
        "normalized_path",
        "difference_paths",
        "pre_selected",
        "post_selected",
        "label_status"
      ],
      unchanged: [
        "candidate_id",
        "canonical_value_sha256"
      ]
    },
    cases,
    conclusion,
    decision_gates: decisionGates,
    effect_evidence_complete: effectsComplete,
    integrity: input.integrity,
    limitations: authority.limitations,
    protocol_gates: protocolGates,
    schema: "kanon-d2e-post-correction-comparison-v1",
    strict_historical_equivalence:
      "failed-required-comparison-unavailable"
  };
}

/**
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 */
export function classifyCandidateDifference(before, after) {
  const preHash = valueSha256(before);
  const postHash = valueSha256(after);
  const intrinsicEqual =
    canonicalJson(candidateIntrinsic(before)) ===
    canonicalJson(candidateIntrinsic(after));
  if (preHash === postHash) {
    return {
      classification: POST_CORRECTION_CLASSIFICATIONS.unchanged,
      difference_paths: [],
      intrinsic_equal: true
    };
  }
  if (isDirectAuthorizedExclusion(before, after)) {
    return {
      classification: POST_CORRECTION_CLASSIFICATIONS.direct,
      difference_paths: differencePaths(before, after),
      intrinsic_equal: intrinsicEqual
    };
  }
  if (isDeterministicDownstreamDisplacement(before, after)) {
    return {
      classification:
        POST_CORRECTION_CLASSIFICATIONS.displacement,
      difference_paths: differencePaths(before, after),
      intrinsic_equal: intrinsicEqual
    };
  }
  return {
    classification: POST_CORRECTION_CLASSIFICATIONS.unexpected,
    difference_paths: differencePaths(before, after),
    intrinsic_equal: intrinsicEqual
  };
}

export function isDirectAuthorizedExclusion(before, after) {
  if (
    canonicalJson(candidateIntrinsic(before)) !==
      canonicalJson(candidateIntrinsic(after)) ||
    before?.candidate_id !== after?.candidate_id ||
    before?.normalized_path !== after?.normalized_path ||
    before?.ranking?.fan_in !== 0 ||
    before?.ranking?.referenced_by !== 0 ||
    before?.ranking?.signals?.some(
      (signal) => signal?.type === "entrypoint"
    ) ||
    !before?.ranking?.signals?.some(
      (signal) =>
        signal?.type === "declaration" &&
        signal?.source !== "framework"
    ) ||
    before?.ranking?.signals?.some(
      (signal) => signal?.source === "framework"
    )
  ) {
    return false;
  }
  const prePackage = visitFor(before, PACKAGE_STAGE);
  const postPackage = visitFor(after, PACKAGE_STAGE);
  if (
    !prePackage ||
    !postPackage ||
    !["selected", "duplicate"].includes(prePackage.decision) ||
    prePackage.reason !== "manifest-declared package target" ||
    prePackage.heuristic !== "manifest-entrypoint" ||
    postPackage.decision !== "policy-excluded" ||
    postPackage.reason !==
      "package declaration lacks independent salience" ||
    postPackage.heuristic !== null ||
    prePackage.stage_ordinal !== PACKAGE_STAGE_ORDINAL ||
    postPackage.stage_ordinal !== PACKAGE_STAGE_ORDINAL ||
    prePackage.entry_position !== postPackage.entry_position ||
    prePackage.quota !== postPackage.quota ||
    prePackage.cap !== postPackage.cap
  ) {
    return false;
  }
  if (
    !visitsCompatible(before, after, {
      direct: true
    })
  ) {
    return false;
  }
  return true;
}

export function isDeterministicDownstreamDisplacement(
  before,
  after
) {
  if (
    canonicalJson(candidateIntrinsic(before)) !==
      canonicalJson(candidateIntrinsic(after)) ||
    before?.candidate_id !== after?.candidate_id ||
    before?.normalized_path !== after?.normalized_path ||
    isDirectAuthorizedExclusion(before, after) ||
    !visitsCompatible(before, after, { direct: false })
  ) {
    return false;
  }
  if (
    before?.curation?.deduplicated !==
      after?.curation?.deduplicated ||
    before?.final?.selection_reason !==
      after?.final?.selection_reason ||
    before?.final?.selection_heuristic !==
      after?.final?.selection_heuristic ||
    !deterministicFinalTransition(before.final, after.final)
  ) {
    return false;
  }
  return differencePaths(before, after).every(
    (item) =>
      item.startsWith("/curation/") ||
      item.startsWith("/final/")
  );
}

export function differencePaths(before, after) {
  const output = [];
  collectDifferencePaths(before, after, "", output);
  return output;
}

function compareStages(
  before,
  after,
  preCandidates,
  postCandidates,
  directIds,
  displacementIds
) {
  requireCondition(
    Array.isArray(before) &&
      Array.isArray(after) &&
      before.length === after.length,
    "comparison-stage-count"
  );
  const changed = [];
  let staticStructureExact = true;
  let manifestExact = true;
  let directBoundaryExact = true;
  const knownChanged = new Set([
    ...directIds,
    ...displacementIds
  ]);
  const preById = new Map(
    preCandidates.map((item) => [item.candidate_id, item])
  );
  const postById = new Map(
    postCandidates.map((item) => [item.candidate_id, item])
  );

  for (let index = 0; index < before.length; index += 1) {
    const pre = before[index];
    const post = after[index];
    const staticPre = stageStatic(pre);
    const staticPost = stageStatic(post);
    const staticExact =
      canonicalJson(staticPre) === canonicalJson(staticPost);
    staticStructureExact &&= staticExact;
    if (pre.name === MANIFEST_STAGE) {
      manifestExact &&=
        canonicalJson(pre) === canonicalJson(post);
    }
    const exact = canonicalJson(pre) === canonicalJson(post);
    if (pre.ordinal < PACKAGE_STAGE_ORDINAL && !exact) {
      directBoundaryExact = false;
    }
    if (pre.name === PACKAGE_STAGE) {
      const removedIds = new Set(
        Array.from(directIds).filter((candidateId) => {
          const preVisit = visitFor(
            preById.get(candidateId),
            PACKAGE_STAGE
          );
          const postVisit = visitFor(
            postById.get(candidateId),
            PACKAGE_STAGE
          );
          return (
            preVisit?.decision === "selected" &&
            postVisit?.decision === "policy-excluded"
          );
        })
      );
      const expectedExit = pre.selected_on_exit.filter(
        (candidateId) => !removedIds.has(candidateId)
      );
      directBoundaryExact &&=
        canonicalJson(pre.selected_on_entry) ===
          canonicalJson(post.selected_on_entry) &&
        canonicalJson(expectedExit) ===
          canonicalJson(post.selected_on_exit);
    } else if (pre.ordinal > PACKAGE_STAGE_ORDINAL && !exact) {
      const changedIds = new Set([
        ...symmetricDifference(
          pre.selected_on_entry,
          post.selected_on_entry
        ),
        ...symmetricDifference(
          pre.selected_on_exit,
          post.selected_on_exit
        )
      ]);
      if (
        !staticExact ||
        Array.from(changedIds).some(
          (candidateId) => !knownChanged.has(candidateId)
        )
      ) {
        directBoundaryExact = false;
      }
    }
    if (!exact) {
      changed.push({
        classification:
          pre.name === PACKAGE_STAGE
            ? POST_CORRECTION_CLASSIFICATIONS.direct
            : pre.ordinal > PACKAGE_STAGE_ORDINAL
              ? POST_CORRECTION_CLASSIFICATIONS.displacement
              : POST_CORRECTION_CLASSIFICATIONS.unexpected,
        difference_paths: differencePaths(pre, post),
        name: pre.name,
        ordinal: pre.ordinal,
        post_sha256: valueSha256(post),
        pre_sha256: valueSha256(pre)
      });
    }
  }
  return {
    changed,
    direct_boundary_exact: directBoundaryExact,
    manifest_entrypoints_exact: manifestExact,
    post_sha256: valueSha256(after),
    pre_sha256: valueSha256(before),
    static_structure_exact: staticStructureExact
  };
}

function compareCaseInvariants(
  preTrace,
  postTrace,
  preResult,
  postResult
) {
  const exact = {
    abstentions:
      canonicalJson(preResult.abstentions) ===
      canonicalJson(postResult.abstentions),
    analysis_error:
      canonicalJson(preResult.analysis_error) ===
      canonicalJson(postResult.analysis_error),
    category: preResult.category === postResult.category,
    completeness:
      canonicalJson(preTrace.completeness) ===
      canonicalJson(postTrace.completeness),
    labels:
      canonicalJson(preResult.labels) ===
      canonicalJson(postResult.labels),
    run_commands:
      canonicalJson(preResult.predictions.run) ===
      canonicalJson(postResult.predictions.run),
    run_scores:
      canonicalJson(preResult.dimensions.run_command) ===
      canonicalJson(postResult.dimensions.run_command),
    scan:
      canonicalJson(preTrace.scan) ===
      canonicalJson(postTrace.scan),
    scan_diagnostics:
      canonicalJson(preResult.scan_diagnostics) ===
      canonicalJson(postResult.scan_diagnostics) &&
      preResult.scan_complete === postResult.scan_complete,
    test_commands:
      canonicalJson(preResult.predictions.test) ===
      canonicalJson(postResult.predictions.test),
    test_scores:
      canonicalJson(preResult.dimensions.test_command) ===
      canonicalJson(postResult.dimensions.test_command)
  };
  const topLevel = {
    case: preTrace.case,
    corpus_sha256: preTrace.corpus_sha256,
    limits: {
      candidate_count: preTrace.limits.candidate_count,
      stage_count: preTrace.limits.stage_count
    },
    protocol_sha256: preTrace.protocol_sha256,
    schema_version: preTrace.schema_version
  };
  const postTopLevel = {
    case: postTrace.case,
    corpus_sha256: postTrace.corpus_sha256,
    limits: {
      candidate_count: postTrace.limits.candidate_count,
      stage_count: postTrace.limits.stage_count
    },
    protocol_sha256: postTrace.protocol_sha256,
    schema_version: postTrace.schema_version
  };
  exact.trace_identity =
    canonicalJson(topLevel) === canonicalJson(postTopLevel);
  const provenanceVariations = [];
  for (const [field, pre, post] of [
    [
      "artifact_sha256",
      preTrace.artifact_sha256,
      postTrace.artifact_sha256
    ],
    [
      "trace_source_commit",
      preTrace.trace_source_commit,
      postTrace.trace_source_commit
    ],
    [
      "limits.serialized_bytes",
      preTrace.limits.serialized_bytes,
      postTrace.limits.serialized_bytes
    ]
  ]) {
    if (canonicalJson(pre) !== canonicalJson(post)) {
      provenanceVariations.push({
        classification:
          POST_CORRECTION_CLASSIFICATIONS.provenance,
        field,
        post_sha256: valueSha256(post),
        pre_sha256: valueSha256(pre)
      });
    }
  }
  const changedVisitCount =
    preTrace.limits.stage_visit_count !==
    postTrace.limits.stage_visit_count;
  return {
    all_exact: Object.values(exact).every(Boolean),
    exact,
    provenance_variations: provenanceVariations,
    stage_visit_count: {
      changed: changedVisitCount,
      delta:
        postTrace.limits.stage_visit_count -
        preTrace.limits.stage_visit_count,
      post: postTrace.limits.stage_visit_count,
      pre: preTrace.limits.stage_visit_count
    }
  };
}

function comparePublicEffects(input) {
  const pre = input.preResult.predictions.important_files;
  const post = input.postResult.predictions.important_files;
  const preSet = new Set(pre);
  const postSet = new Set(post);
  const removed = pre.filter((item) => !postSet.has(item));
  const added = post.filter((item) => !preSet.has(item));
  const preByPath = new Map(
    input.preTrace.candidates.map((item) => [
      item.normalized_path,
      item
    ])
  );
  const postByPath = new Map(
    input.postTrace.candidates.map((item) => [
      item.normalized_path,
      item
    ])
  );
  const moved = post.filter(
    (item) =>
      preSet.has(item) &&
      pre.indexOf(item) !== post.indexOf(item)
  );
  const removedEvidence = removed.map((item) => ({
    candidate_id: preByPath.get(item)?.candidate_id || null,
    classification: input.directIds.has(
      preByPath.get(item)?.candidate_id
    )
      ? POST_CORRECTION_CLASSIFICATIONS.direct
      : POST_CORRECTION_CLASSIFICATIONS.unexpected,
    path: item
  }));
  const addedEvidence = added.map((item) => ({
    candidate_id: postByPath.get(item)?.candidate_id || null,
    classification: input.displacementIds.has(
      postByPath.get(item)?.candidate_id
    )
      ? POST_CORRECTION_CLASSIFICATIONS.displacement
      : POST_CORRECTION_CLASSIFICATIONS.unexpected,
    path: item
  }));
  const movedEvidence = moved.map((item) => ({
    candidate_id: postByPath.get(item)?.candidate_id || null,
    classification: input.displacementIds.has(
      postByPath.get(item)?.candidate_id
    )
      ? POST_CORRECTION_CLASSIFICATIONS.displacement
      : POST_CORRECTION_CLASSIFICATIONS.unexpected,
    path: item,
    post_rank: post.indexOf(item) + 1,
    pre_rank: pre.indexOf(item) + 1
  }));
  const preFp =
    input.preResult.dimensions.important_files.false_positives;
  const postFp =
    input.postResult.dimensions.important_files.false_positives;
  const preFn =
    input.preResult.dimensions.important_files.false_negatives;
  const postFn =
    input.postResult.dimensions.important_files.false_negatives;
  return {
    added: addedEvidence,
    added_false_negatives: setDifference(postFn, preFn),
    explained: [
      ...removedEvidence,
      ...addedEvidence,
      ...movedEvidence
    ].every(
      (item) =>
        item.classification !==
        POST_CORRECTION_CLASSIFICATIONS.unexpected
    ),
    moved: movedEvidence,
    new_false_positives: setDifference(postFp, preFp),
    removed: removedEvidence,
    removed_false_negatives: setDifference(preFn, postFn),
    removed_false_positives: setDifference(preFp, postFp)
  };
}

function caseScoreEvidence(before, after) {
  const dimensions = {};
  for (const name of [
    "important_files",
    "run_command",
    "test_command"
  ]) {
    dimensions[name] = metricEvidence(
      before.dimensions[name],
      after.dimensions[name]
    );
  }
  return {
    all_frozen_score_fields: valueDelta(
      {
        abstentions: before.abstentions,
        dimensions: before.dimensions,
        totals: before.totals
      },
      {
        abstentions: after.abstentions,
        dimensions: after.dimensions,
        totals: after.totals
      }
    ),
    coverage: {
      delta: {
        important_files:
          Number(!after.abstentions.important_files) -
          Number(!before.abstentions.important_files),
        run_command:
          Number(!after.abstentions.run_command) -
          Number(!before.abstentions.run_command),
        test_command:
          Number(!after.abstentions.test_command) -
          Number(!before.abstentions.test_command)
      },
      post: {
        important_files: Number(
          !after.abstentions.important_files
        ),
        run_command: Number(!after.abstentions.run_command),
        test_command: Number(!after.abstentions.test_command)
      },
      pre: {
        important_files: Number(
          !before.abstentions.important_files
        ),
        run_command: Number(!before.abstentions.run_command),
        test_command: Number(!before.abstentions.test_command)
      }
    },
    dimensions,
    totals: metricEvidence(before.totals, after.totals)
  };
}

function aggregateScoreEvidence(before, after) {
  const preSummary = before.summary;
  const postSummary = after.summary;
  const dimensions = {};
  for (const name of Object.keys(preSummary.dimensions).sort()) {
    dimensions[name] = metricEvidence(
      preSummary.dimensions[name],
      postSummary.dimensions[name]
    );
  }
  const categories = {};
  for (const name of Object.keys(preSummary.categories).sort()) {
    categories[name] = metricEvidence(
      preSummary.categories[name],
      postSummary.categories[name]
    );
  }
  const totals = metricEvidence(
    preSummary.totals,
    postSummary.totals
  );
  const important = dimensions.important_files;
  return {
    all_frozen_score_fields: valueDelta(
      aggregateFrozenScoreProjection(preSummary),
      aggregateFrozenScoreProjection(postSummary)
    ),
    abstentions: valueDelta(
      preSummary.abstentions,
      postSummary.abstentions
    ),
    case_average: valueDelta(
      preSummary.case_average,
      postSummary.case_average
    ),
    categories,
    dimensions,
    macro_over_category: valueDelta(
      preSummary.macro_over_category,
      postSummary.macro_over_category
    ),
    macro_over_dimension: valueDelta(
      preSummary.macro_over_dimension,
      postSummary.macro_over_dimension
    ),
    precision_non_decreasing:
      totals.post.precision >= totals.pre.precision &&
      important.post.precision >= important.pre.precision,
    prediction_coverage: valueDelta(
      preSummary.prediction_coverage,
      postSummary.prediction_coverage
    ),
    recall_non_decreasing:
      totals.post.recall >= totals.pre.recall &&
      important.post.recall >= important.pre.recall,
    totals
  };
}

function aggregateFrozenScoreProjection(summary) {
  return {
    abstentions: summary.abstentions,
    analysis_error_count: summary.analysis_error_count,
    case_average: summary.case_average,
    case_count: summary.case_count,
    categories: summary.categories,
    dimensions: summary.dimensions,
    expected_case_count: summary.expected_case_count,
    failures: summary.failures,
    incomplete_scan_count: summary.incomplete_scan_count,
    macro_over_category: summary.macro_over_category,
    macro_over_dimension: summary.macro_over_dimension,
    passed: summary.passed,
    policy: summary.policy,
    prediction_coverage: summary.prediction_coverage,
    totals: summary.totals
  };
}

function unchangedProtocolGates(before, after, integrity) {
  const exact = {
    analyzer: canonicalJson(before.analyzer) === canonicalJson(after.analyzer),
    corpus: canonicalJson(before.corpus) === canonicalJson(after.corpus),
    limits: canonicalJson(before.limits) === canonicalJson(after.limits),
    policy:
      canonicalJson(before.summary.policy) ===
      canonicalJson(after.summary.policy),
    result_count:
      before.results.length === 30 && after.results.length === 30,
    result_identity_order:
      canonicalJson(
        before.results.map((item) => ({
          category: item.category,
          id: item.id,
          revision: item.revision
        }))
      ) ===
      canonicalJson(
        after.results.map((item) => ({
          category: item.category,
          id: item.id,
          revision: item.revision
        }))
      )
  };
  const preThresholds = thresholdGateProjection(before.summary);
  const postThresholds = thresholdGateProjection(after.summary);
  const thresholdNonRegression = preThresholds.every(
    (item, index) =>
      item.name === postThresholds[index]?.name &&
      (!item.passed || postThresholds[index].passed)
  );
  return {
    exact,
    integrity_passed: integrity?.passed === true,
    passed:
      integrity?.passed === true &&
      Object.values(exact).every(Boolean) &&
      thresholdNonRegression,
    performance_thresholds: {
      non_regression: thresholdNonRegression,
      post: postThresholds,
      pre: preThresholds
    }
  };
}

function thresholdGateProjection(summary) {
  const policy = summary.policy;
  const output = [
    thresholdRecord("overall-precision", summary.totals.precision,
      policy.minimum_precision, "minimum"),
    thresholdRecord("overall-recall", summary.totals.recall,
      policy.minimum_recall, "minimum"),
    thresholdRecord(
      "weighted-error-per-case",
      summary.totals.weighted_error_per_case,
      policy.maximum_weighted_error_per_case,
      "maximum"
    )
  ];
  for (const name of Object.keys(summary.dimensions).sort()) {
    output.push(
      thresholdRecord(
        `dimension-${name}-precision`,
        summary.dimensions[name].precision,
        policy.dimension_thresholds[name].minimum_precision,
        "minimum"
      ),
      thresholdRecord(
        `dimension-${name}-recall`,
        summary.dimensions[name].recall,
        policy.dimension_thresholds[name].minimum_recall,
        "minimum"
      )
    );
  }
  for (const name of Object.keys(summary.categories).sort()) {
    output.push(
      thresholdRecord(
        `category-${name}-case-count`,
        summary.categories[name].case_count,
        policy.minimum_cases_per_category,
        "minimum"
      ),
      thresholdRecord(
        `category-${name}-precision`,
        summary.categories[name].precision,
        policy.category_thresholds[name].minimum_precision,
        "minimum"
      ),
      thresholdRecord(
        `category-${name}-recall`,
        summary.categories[name].recall,
        policy.category_thresholds[name].minimum_recall,
        "minimum"
      )
    );
  }
  output.push(
    {
      actual: summary.case_count,
      name: "case-count",
      passed: summary.case_count === summary.expected_case_count,
      required: summary.expected_case_count
    },
    {
      actual: summary.analysis_error_count,
      name: "analysis-errors",
      passed: summary.analysis_error_count === 0,
      required: 0
    }
  );
  return output;
}

function thresholdRecord(name, actual, required, direction) {
  return {
    actual,
    direction,
    name,
    passed:
      direction === "minimum"
        ? actual >= required
        : actual <= required,
    required
  };
}

function metricEvidence(before, after) {
  const pre = metricProjection(before);
  const post = metricProjection(after);
  return {
    delta: numericDelta(pre, post),
    post,
    pre
  };
}

function metricProjection(value) {
  const tp = Number(value?.tp || 0);
  const fp = Number(value?.fp || 0);
  const fn = Number(value?.fn || 0);
  const predicted = tp + fp;
  const expected = tp + fn;
  const output = {
    fn,
    fp,
    precision:
      predicted > 0 ? tp / predicted : expected === 0 ? 1 : 0,
    recall: expected > 0 ? tp / expected : 1,
    tp
  };
  for (const key of [
    "case_count",
    "weighted_error",
    "weighted_error_per_case"
  ]) {
    if (typeof value?.[key] === "number") {
      output[key] = value[key];
    }
  }
  return output;
}

function valueDelta(before, after) {
  return {
    delta: numericDelta(before, after),
    post: after,
    pre: before
  };
}

function numericDelta(before, after) {
  if (
    typeof before === "number" &&
    typeof after === "number"
  ) {
    return after - before;
  }
  if (plainRecord(before) && plainRecord(after)) {
    const output = {};
    for (const key of Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)])
    ).sort()) {
      output[key] = numericDelta(before[key], after[key]);
    }
    return output;
  }
  return canonicalJson(before) === canonicalJson(after)
    ? 0
    : null;
}

function candidateIntrinsic(candidate) {
  return {
    candidate_id: candidate?.candidate_id,
    discovery_source: candidate?.discovery_source,
    evidence: candidate?.evidence,
    normalized_path: candidate?.normalized_path,
    ranking: candidate?.ranking
  };
}

function candidateIdentity(candidate) {
  return {
    candidate_id: candidate.candidate_id,
    discovery_source: candidate.discovery_source,
    normalized_path: candidate.normalized_path,
    input_position: candidate.ranking.input_position
  };
}

function visitsCompatible(before, after, options) {
  const preVisits = before?.curation?.visits || [];
  const postVisits = after?.curation?.visits || [];
  const preCore = preVisits.filter(
    (item) => item.stage !== FINAL_STAGE
  );
  const postCore = postVisits.filter(
    (item) => item.stage !== FINAL_STAGE
  );
  if (preCore.length !== postCore.length) {
    return false;
  }
  for (let index = 0; index < preCore.length; index += 1) {
    const pre = preCore[index];
    const post = postCore[index];
    if (
      pre.stage !== post.stage ||
      pre.stage_ordinal !== post.stage_ordinal
    ) {
      return false;
    }
    if (pre.stage_ordinal < PACKAGE_STAGE_ORDINAL) {
      if (canonicalJson(pre) !== canonicalJson(post)) {
        return false;
      }
      continue;
    }
    if (
      options.direct &&
      pre.stage === PACKAGE_STAGE &&
      post.stage === PACKAGE_STAGE
    ) {
      continue;
    }
    if (
      canonicalJson(visitStableProjection(pre)) !==
      canonicalJson(visitStableProjection(post))
    ) {
      return false;
    }
  }
  const preFinal = preVisits.filter(
    (item) => item.stage === FINAL_STAGE
  );
  const postFinal = postVisits.filter(
    (item) => item.stage === FINAL_STAGE
  );
  if (preFinal.length > 1 || postFinal.length > 1) {
    return false;
  }
  if (!options.direct) {
    for (const item of [...preFinal, ...postFinal]) {
      if (
        item.stage_ordinal !== 15 ||
        item.decision !== "cap-excluded" ||
        item.cap !== 5
      ) {
        return false;
      }
    }
  }
  return true;
}

function visitStableProjection(visit) {
  return {
    cap: visit.cap,
    decision: visit.decision,
    deduplicated: visit.deduplicated,
    displaced_by: visit.stage === FINAL_STAGE
      ? null
      : visit.displaced_by,
    entry_position:
      visit.stage === FINAL_STAGE ? null : visit.entry_position,
    heuristic: visit.heuristic,
    quota: visit.quota,
    reason: visit.reason,
    stage: visit.stage,
    stage_ordinal: visit.stage_ordinal
  };
}

function deterministicFinalTransition(before, after) {
  if (!before || !after) {
    return false;
  }
  if (before.selected === true) {
    return (
      after.selected === true &&
      Number.isInteger(after.rank) &&
      after.rank <= before.rank &&
      after.result === "selected"
    );
  }
  if (before.result === "cap-excluded") {
    return (
      (after.selected === true &&
        after.result === "selected" &&
        Number.isInteger(after.rank)) ||
      (after.selected === false &&
        after.result === "cap-excluded" &&
        after.rank === null)
    );
  }
  return canonicalJson(before) === canonicalJson(after);
}

function stageStatic(stage) {
  return {
    name: stage.name,
    ordering: stage.ordering,
    ordinal: stage.ordinal,
    quota: stage.quota
  };
}

function visitFor(candidate, stage) {
  return candidate?.curation?.visits?.find(
    (item) => item.stage === stage
  ) || null;
}

function caseHistoricalProjection(result) {
  const projection = structuredClone(result);
  delete projection.analysis_duration_ms;
  delete projection.scan_diagnostics;
  return projection;
}

function collectDifferencePaths(before, after, pointer, output) {
  if (Object.is(before, after)) {
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      output.push(`${pointer}/length`);
    }
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      collectDifferencePaths(
        before[index],
        after[index],
        `${pointer}/${index}`,
        output
      );
    }
    return;
  }
  if (plainRecord(before) && plainRecord(after)) {
    const keys = Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)])
    ).sort();
    for (const key of keys) {
      collectDifferencePaths(
        before[key],
        after[key],
        `${pointer}/${escapePointer(key)}`,
        output
      );
    }
    return;
  }
  output.push(pointer || "/");
}

function escapePointer(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function symmetricDifference(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  return [
    ...left.filter((item) => !b.has(item)),
    ...right.filter((item) => !a.has(item))
  ];
}

function setDifference(left, right) {
  const excluded = new Set(right);
  return left.filter((item) => !excluded.has(item));
}

function valueSha256(value) {
  return sha256(Buffer.from(canonicalJson(value)));
}

function plainRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function requireCondition(condition, label) {
  if (!condition) {
    throw new Error(
      `D.2E post-correction comparison failed: ${label}.`
    );
  }
}
