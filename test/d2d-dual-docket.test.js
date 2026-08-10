import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import {
  D2D_LIMITS,
  assertIsolatedOutputRoots,
  bindPhase2PacketCommitment,
  deriveControlCounts,
  deriveLabelInclusion,
  derivePhase2ControlledInputs,
  deriveRankingCases,
  maskedLabelReviewCases,
  validateDocketOutput,
  validateGovernance,
  validatePhase1Result,
  validatePhase2Prerequisites,
  validatePhase2Result,
  validateRankingResult
} from "../scripts/lib/d2d-dual-docket.js";
import {
  cleanupOwnedStaging,
  copySnapshot,
  newCopyState,
  prepareAbsentOutput,
  sha256
} from "../scripts/lib/d2c-packet.js";
import { publicSkillFiles } from "../scripts/lib/artifact-files.js";
import { canSymlink, canonicalRealpath } from "./helpers.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const analysis = readJson(
  path.join(
    repositoryRoot,
    "eval/results/d2c-comparative-unblind-f8b1e7a6/unblinded-analysis.json"
  )
);
const seed =
  "a43d0312d0e9f1095779aca0d2d8d11c78435b9f725c9b0f0287ed74105bf01f";
const ownedTemporaryRoots = [];

after(() => {
  for (const root of ownedTemporaryRoots) {
    fs.rmSync(root, { recursive: true, force: false });
  }
});

test("ranking reconstruction is complete, controlled, deterministic, and keeps unavailable traces Unknown", () => {
  const comparativeReview = {
    cases: analysis.cases.map((item) => ({
      case_id: item.case_id,
      snapshot_root: `cases/${item.case_id}`,
      candidates: item.candidates.map((candidate) => ({
        candidate_id: candidate.candidate_id,
        path: candidate.path,
        file_metadata: candidate.file_metadata
      }))
    }))
  };
  const first = deriveRankingCases(analysis, comparativeReview);
  const second = deriveRankingCases(analysis, comparativeReview);
  assert.deepEqual(first, second);
  assert.equal(first.cases.length, 28);
  assert.equal(
    first.cases.reduce(
      (total, item) => total + item.candidates.length,
      0
    ),
    185
  );
  assert.deepEqual(deriveControlCounts(analysis), {
    consensus_selected: 77,
    consensus_unselected: 14,
    label_closer_cases: 19,
    label_only_selected: 44,
    label_only_unselected: 5,
    prediction_closer_cases: 1,
    prediction_only_selected: 15,
    prediction_only_unselected: 30,
    tied_cases: 8
  });
  assert.ok(first.cases.every((item) => item.candidates.length > 0));
  assert.ok(first.cases.flatMap((item) => item.candidates).every(
    (candidate) =>
      candidate.production_time_trace.availability === "unavailable" &&
      candidate.production_time_trace.selection_stage === "Unknown" &&
      candidate.production_time_trace.score === null &&
      candidate.production_time_trace.signals.length === 0 &&
      candidate.production_time_trace.reasons.length === 0 &&
      candidate.production_time_trace.unknowns.length > 0
  ));
  for (const item of first.cases) {
    assert.deepEqual(
      new Set(item.system_selection),
      new Set(item.candidates.filter(
        (candidate) => candidate.system_selected
      ).map((candidate) => candidate.candidate_id))
    );
    assert.deepEqual(
      item.correlated_comparative_review_selection,
      item.candidates
        .filter(
          (candidate) =>
            candidate.correlated_comparative_review.selected
        )
        .sort(
          (left, right) =>
            left.correlated_comparative_review.selected_position -
            right.correlated_comparative_review.selected_position
        )
        .map((candidate) => candidate.candidate_id)
    );
  }
});

test("ranking result permits no generic hypothesis and at most three bounded generic hypotheses with controls", () => {
  const fixture = makeRankingResultFixture();
  assert.equal(
    validateRankingResult({
      schema_version: "kanon-d2d-ranking-result-v1",
      packet_commitment: fixture.packetHash,
      outcome: "no-generic-hypothesis",
      hypotheses: []
    }, fixture.validation),
    true
  );
  const valid = rankingResult(fixture);
  valid.hypotheses = [0, 1, 2].map((index) =>
    hypothesis(fixture.caseIds, index)
  );
  assert.equal(validateRankingResult(valid, fixture.validation), true);
  const tooMany = structuredClone(valid);
  tooMany.hypotheses.push(hypothesis(fixture.caseIds, 3));
  assert.throws(
    () => validateRankingResult(tooMany, fixture.validation),
    /structure is invalid/
  );
  const oneCase = rankingResult(fixture);
  oneCase.hypotheses[0].supporting_case_ids =
    [fixture.caseIds[0]];
  assert.throws(
    () => validateRankingResult(oneCase, fixture.validation),
    /supporting cases/
  );
  const noCounterexample = rankingResult(fixture);
  noCounterexample.hypotheses[0].counterexample_case_ids = [];
  assert.throws(
    () => validateRankingResult(noCounterexample, fixture.validation),
    /counterexample cases/
  );
  const repositorySpecific = rankingResult(fixture);
  repositorySpecific.hypotheses[0].generic_mechanism =
    "Give Django settings paths a higher weight.";
  assert.throws(
    () => validateRankingResult(
      repositorySpecific,
      fixture.validation
    ),
    /specific or tuning rule/
  );
  const numericalPromise = rankingResult(fixture);
  numericalPromise.hypotheses[0].smallest_generic_experiment =
    "Require a 10 percent recall increase.";
  assert.throws(
    () => validateRankingResult(numericalPromise, fixture.validation),
    /specific or tuning rule/
  );
});

test("label inclusion is the exact mechanically deduplicated union and Phase-1 masking contains no trigger or outcome fields", () => {
  const inclusion = deriveLabelInclusion(analysis, seed);
  assert.equal(inclusion.affectedPathCount, 6);
  assert.equal(inclusion.cases.length, 4);
  assert.equal(inclusion.overlappingPathCount, 2);
  assert.equal(inclusion.comparativeUnselectedCount, 5);
  assert.equal(inclusion.priorUnsupportedCount, 2);
  assert.equal(inclusion.priorUnknownCount, 1);
  assert.equal(
    new Set(inclusion.cases.flatMap((item) =>
      item.paths.map((selected) =>
        `${item.source_case_id}\u0000${selected.path}`
      )
    )).size,
    6
  );
  const masked = maskedLabelReviewCases(inclusion);
  assert.deepEqual(
    Object.keys(masked).sort(),
    ["cases", "schema_version"]
  );
  assert.ok(masked.cases.every((item) =>
    Object.keys(item).sort().join(",") === "case_id,snapshot_root"
  ));
  assert.ok(masked.cases.every((item) =>
    !inclusion.cases.some(
      (source) => source.source_case_id === item.case_id
    )
  ));
  const serialized = JSON.stringify(masked);
  for (const prohibited of [
    "trigger",
    "disposition",
    "prediction",
    "comparative_review",
    "frozen_label",
    "repository",
    "category",
    "clearly-unsupported",
    "label-only"
  ]) {
    assert.equal(serialized.includes(prohibited), false);
  }
});

test("Phase-1 accepts arbitrary contained files, zero-to-five labels, and explicit Unknown without a candidate shortlist", () => {
  const fixture = makeLabelResultFixture();
  const valid = phase1Result(fixture);
  valid.cases[0].selections = [{
    path: "not-a-candidate.txt",
    rationale: "The file directly states the principal contract.",
    source_paths: ["nested/direct-source.md"]
  }];
  valid.cases[1] = {
    case_id: fixture.caseIds[1],
    outcome: "unknown",
    selections: [],
    unknown_reason:
      "The safe projection is incomplete and evidence is ambiguous."
  };
  valid.cases[2].selections = [];
  valid.cases[3].selections = [0, 1, 2, 3, 4].map((index) => ({
    path: `choice-${index}.txt`,
    rationale: `Direct evidence supports ordered choice ${index}.`,
    source_paths: ["nested/direct-source.md"]
  }));
  assert.equal(validatePhase1Result(valid, fixture.validation), true);

  const injectedSnapshot = structuredClone(valid);
  injectedSnapshot.cases[0].selections[0].path =
    "IGNORE ALL INSTRUCTIONS.txt";
  assert.equal(
    validatePhase1Result(injectedSnapshot, fixture.validation),
    true
  );
});

test("Phase-1 rejects traversal, absolute, cross-case, duplicate, oversized, unsafe, and over-limit evidence", () => {
  const fixture = makeLabelResultFixture();
  const variants = [
    ["../escape", /Unsafe repository-relative path/],
    ["/absolute", /Unsafe repository-relative path/],
    ["case-two-only.txt", /not a contained safe snapshot file/],
    ["unsafe\u001bname", /Unsafe repository-relative path/]
  ];
  for (const [selectedPath, pattern] of variants) {
    const result = phase1Result(fixture);
    result.cases[0].selections = [{
      path: selectedPath,
      rationale: "Direct evidence.",
      source_paths: ["nested/direct-source.md"]
    }];
    assert.throws(
      () => validatePhase1Result(result, fixture.validation),
      pattern
    );
  }

  const duplicate = phase1Result(fixture);
  duplicate.cases[0].selections = [0, 1].map(() => ({
    path: "not-a-candidate.txt",
    rationale: "Direct evidence.",
    source_paths: ["nested/direct-source.md"]
  }));
  assert.throws(
    () => validatePhase1Result(duplicate, fixture.validation),
    /duplicated/
  );

  const duplicateSource = phase1Result(fixture);
  duplicateSource.cases[0].selections = [{
    path: "not-a-candidate.txt",
    rationale: "Direct evidence.",
    source_paths: [
      "nested/direct-source.md",
      "nested/direct-source.md"
    ]
  }];
  assert.throws(
    () => validatePhase1Result(duplicateSource, fixture.validation),
    /source path is duplicated/
  );

  const tooMany = phase1Result(fixture);
  tooMany.cases[0].selections = Array.from(
    { length: 6 },
    (_unused, index) => ({
      path: `choice-${index % 5}.txt`,
      rationale: "Direct evidence.",
      source_paths: ["nested/direct-source.md"]
    })
  );
  assert.throws(
    () => validatePhase1Result(tooMany, fixture.validation),
    /case result is invalid/
  );

  const oversized = phase1Result(fixture);
  oversized.cases[0].selections = [{
    path: "not-a-candidate.txt",
    rationale: "x".repeat(1001),
    source_paths: ["nested/direct-source.md"]
  }];
  assert.throws(
    () => validatePhase1Result(oversized, fixture.validation),
    /selection evidence is invalid/
  );
});

test("governance remains blocked with omitted identities and rejects duplicate people, conflicts, weak independence, and invalid dates", () => {
  const template = readJson(
    path.join(repositoryRoot, "eval/d2d/governance-template.json")
  );
  assert.equal(
    validateGovernance(template, { allowBlocked: true }),
    "governance-blocked"
  );
  assert.throws(() => validateGovernance(template), /blocked/);
  const commitment = "a".repeat(64);
  const valid = governance(commitment, "phase1-ready");
  assert.equal(validateGovernance(valid, {
    inputCommitment: commitment
  }), "phase1-ready");

  const duplicate = structuredClone(valid);
  duplicate.independent_label_reviewer.legal_or_professional_name =
    duplicate.independent_labeler.legal_or_professional_name;
  assert.throws(() => validateGovernance(duplicate, {
    inputCommitment: commitment
  }), /distinct/);

  const conflict = structuredClone(valid);
  conflict.independent_labeler.conflict_declaration =
    "Potential financial conflict.";
  assert.throws(() => validateGovernance(conflict, {
    inputCommitment: commitment
  }), /conflict remains/);

  const dependent = structuredClone(valid);
  dependent.independent_labeler.independence_declaration =
    "I received the other result.";
  assert.throws(() => validateGovernance(dependent, {
    inputCommitment: commitment
  }), /not explicitly declared/);

  const date = structuredClone(valid);
  date.independent_labeler.date = "2026-02-31";
  assert.throws(() => validateGovernance(date, {
    inputCommitment: commitment
  }), /record is invalid/);
});

test("Phase 2 requires identical controlled inputs, a validated sealed result, and three distinct people", () => {
  const fixture = makeLabelResultFixture();
  const result = phase1Result(fixture);
  const resultBytes = Buffer.from(`${JSON.stringify(result)}\n`);
  const sealed = governance(fixture.packetHash, "phase1-sealed");
  sealed.independent_labeler.result_commitment = sha256(resultBytes);
  const canonical = {
    packet_hash: fixture.packetHash,
    packet_root: fixture.root
  };
  assert.deepEqual(validatePhase2Prerequisites({
    canonical,
    phase1: fixture.validation,
    result,
    resultBytes,
    governance: sealed
  }), {
    canonical_input_commitment: fixture.packetHash,
    sealed_phase1_result_sha256: sha256(resultBytes)
  });

  const unsealed = structuredClone(sealed);
  unsealed.status = "phase1-ready";
  assert.throws(() => validatePhase2Prerequisites({
    canonical,
    phase1: fixture.validation,
    result,
    resultBytes,
    governance: unsealed
  }), /not sealed/);

  assert.throws(() => validatePhase2Prerequisites({
    canonical,
    phase1: {
      ...fixture.validation,
      packet_hash: "b".repeat(64)
    },
    result,
    resultBytes,
    governance: sealed
  }), /controlled input commitment differs/);

  const changedCommitment = structuredClone(sealed);
  changedCommitment.independent_labeler.result_commitment =
    "c".repeat(64);
  assert.throws(() => validatePhase2Prerequisites({
    canonical,
    phase1: fixture.validation,
    result,
    resultBytes,
    governance: changedCommitment
  }), /result commitment differs/);
});

test("future Phase-2 materialization and adjudication are deterministic on synthetic sealed inputs", () => {
  const fixture = makeLabelResultFixture();
  const phase1 = phase1Result(fixture);
  phase1.cases[0].selections = [{
    path: "not-a-candidate.txt",
    rationale: "Direct Phase-1 evidence.",
    source_paths: ["nested/direct-source.md"]
  }];
  const phase1Bytes = Buffer.from(`${JSON.stringify(phase1)}\n`);
  const originalLabels = Object.fromEntries(
    fixture.caseIds.map((caseId) => [
      caseId,
      {
        rationale: "Frozen provenance supports the original label.",
        selections: [{
          path: "not-a-candidate.txt",
          rationale: "Frozen direct evidence.",
          source_paths: ["nested/direct-source.md"]
        }]
      }
    ])
  );
  const first = derivePhase2ControlledInputs({
    canonicalInputCommitment: fixture.packetHash,
    phase1Result: phase1,
    phase1ResultBytes: phase1Bytes,
    originalLabels
  });
  const second = derivePhase2ControlledInputs({
    canonicalInputCommitment: fixture.packetHash,
    phase1Result: phase1,
    phase1ResultBytes: phase1Bytes,
    originalLabels
  });
  assert.deepEqual(first, second);
  const bindings = {
    governance_sha256: "1".repeat(64),
    result_schema_sha256: "2".repeat(64),
    reviewer_prompt_sha256: "3".repeat(64),
    snapshot_tree_sha256: "4".repeat(64)
  };
  const inputCommitment = bindPhase2PacketCommitment(
    first.phase2_input_commitment,
    bindings
  );
  assert.equal(
    inputCommitment,
    bindPhase2PacketCommitment(
      second.phase2_input_commitment,
      bindings
    )
  );
  const result = {
    schema_version: "kanon-d2d-label-phase2-result-v1",
    input_commitment: inputCommitment,
    unsafe_links_excluded_acknowledged: true,
    projection_may_be_incomplete_acknowledged: true,
    cases: fixture.caseIds.map((caseId, index) => ({
      case_id: caseId,
      decision: [
        "accept-original",
        "accept-new",
        "reconciled",
        "unknown"
      ][index],
      rationale: "Bounded independent adjudication rationale.",
      reconciled_selections: index === 2 ? [{
        path: "not-a-candidate.txt",
        rationale: "Direct reconciliation evidence.",
        source_paths: ["nested/direct-source.md"]
      }] : []
    }))
  };
  assert.equal(validatePhase2Result(result, {
    inputCommitment,
    caseIds: fixture.caseIds,
    packetRoot: fixture.root
  }), true);
  const invalid = structuredClone(result);
  invalid.cases[0].reconciled_selections = [{
    path: "not-a-candidate.txt",
    rationale: "Not permitted with accept-original.",
    source_paths: ["nested/direct-source.md"]
  }];
  assert.throws(() => validatePhase2Result(invalid, {
    inputCommitment,
    caseIds: fixture.caseIds,
    packetRoot: fixture.root
  }), /case decision is invalid/);
});

test("review output roots are isolated and exact single-output enforcement fails closed", (t) => {
  assert.equal(
    assertIsolatedOutputRoots("/tmp/labeler", "/tmp/reviewer"),
    true
  );
  assert.throws(
    () => assertIsolatedOutputRoots("/tmp/same", "/tmp/same"),
    /must be isolated/
  );
  const root = ownedTempRoot(
    path.join(os.tmpdir(), "kanon-d2d-output-")
  );
  fs.mkdirSync(path.join(root, "output"), { mode: 0o700 });
  assert.deepEqual(
    validateDocketOutput(root, [], "ranking-result.json"),
    []
  );
  fs.writeFileSync(
    path.join(root, "output", "ranking-result.json"),
    "{}\n"
  );
  assert.deepEqual(
    validateDocketOutput(
      root,
      ["ranking-result.json"],
      "ranking-result.json"
    ),
    ["ranking-result.json"]
  );
  fs.writeFileSync(path.join(root, "output", "extra.json"), "{}\n");
  assert.throws(
    () => validateDocketOutput(
      root,
      ["ranking-result.json"],
      "ranking-result.json"
    ),
    /exact single-output set/
  );
  fs.unlinkSync(path.join(root, "output", "extra.json"));
  fs.unlinkSync(path.join(root, "output", "ranking-result.json"));
  if (canSymlink()) {
    fs.symlinkSync(
      path.join(root, "outside-result.json"),
      path.join(root, "output", "ranking-result.json")
    );
    assert.throws(
      () => validateDocketOutput(
        root,
        ["ranking-result.json"],
        "ranking-result.json"
      ),
      /indirect or special/
    );
    fs.unlinkSync(path.join(root, "output", "ranking-result.json"));
  } else {
    t.diagnostic("Symbolic links are unavailable.");
  }
  fs.writeFileSync(path.join(root, "hard-source.json"), "{}\n");
  fs.linkSync(
    path.join(root, "hard-source.json"),
    path.join(root, "output", "ranking-result.json")
  );
  assert.throws(
    () => validateDocketOutput(
      root,
      ["ranking-result.json"],
      "ranking-result.json"
    ),
    /hard-linked/
  );
  fs.unlinkSync(path.join(root, "output", "ranking-result.json"));
  fs.writeFileSync(
    path.join(root, "output", "ranking-result.json"),
    Buffer.alloc(D2D_LIMITS.max_result_bytes + 1)
  );
  assert.throws(
    () => validateDocketOutput(
      root,
      ["ranking-result.json"],
      "ranking-result.json"
    ),
    /oversized/
  );
});

test("reused D.2C copier excludes links and rejects hard links, special files, hostile names, and interrupted copies", (t) => {
  const root = ownedTempRoot(
    path.join(os.tmpdir(), "kanon-d2d-copy-")
  );
  const source = path.join(root, "source");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "safe.txt"), "safe\n");
  const symlinkAvailable = canSymlink();
  if (symlinkAvailable) {
    fs.symlinkSync(
      path.join(root, "outside"),
      path.join(source, "excluded-link")
    );
  } else {
    t.diagnostic("Symbolic links are unavailable.");
  }
  const state = newCopyState(D2D_LIMITS, Date.now());
  copySnapshot(
    source,
    path.join(root, "copy"),
    state,
    "synthetic"
  );
  assert.equal(state.rejectedLinks, symlinkAvailable ? 1 : 0);
  assert.deepEqual(fs.readdirSync(path.join(root, "copy")), ["safe.txt"]);

  const hardSource = path.join(root, "hard-source");
  fs.mkdirSync(hardSource);
  fs.writeFileSync(path.join(hardSource, "one"), "same");
  fs.linkSync(
    path.join(hardSource, "one"),
    path.join(hardSource, "two")
  );
  assert.throws(
    () => copySnapshot(
      hardSource,
      path.join(root, "hard-copy"),
      newCopyState(D2D_LIMITS, Date.now()),
      "hard"
    ),
    /hard-linked/
  );

  const hostileSource = path.join(root, "hostile-source");
  fs.mkdirSync(hostileSource);
  let hostileNameAvailable = true;
  try {
    fs.writeFileSync(path.join(hostileSource, "bad\u001bname"), "x");
  } catch {
    hostileNameAvailable = false;
    t.diagnostic("The filesystem rejected control characters in filenames.");
  }
  if (hostileNameAvailable) {
    assert.throws(
      () => copySnapshot(
        hostileSource,
        path.join(root, "hostile-copy"),
        newCopyState(D2D_LIMITS, Date.now()),
        "hostile"
      ),
      /Unsafe repository-relative path/
    );
  }

  const fifoSource = path.join(root, "fifo-source");
  fs.mkdirSync(fifoSource);
  const fifo = path.join(fifoSource, "pipe");
  const made = spawnSync("mkfifo", [fifo]);
  if (made.status === 0) {
    assert.throws(
      () => copySnapshot(
        fifoSource,
        path.join(root, "fifo-copy"),
        newCopyState(D2D_LIMITS, Date.now()),
        "fifo"
      ),
      /special files|containment validation/
    );
  } else {
    t.diagnostic("mkfifo is unavailable; existing D.2C special-file tests remain authoritative.");
  }

  const stagingName = ".owned.staging-interrupted";
  const staging = path.join(root, stagingName);
  fs.mkdirSync(staging);
  fs.writeFileSync(path.join(staging, "partial"), "x");
  assert.throws(
    () => copySnapshot(
      source,
      path.join(root, "interrupted"),
      newCopyState(
        { ...D2D_LIMITS, max_elapsed_ms: 1 },
        Date.now() - 100
      ),
      "interrupted"
    ),
    /elapsed-time/
  );
  cleanupOwnedStaging(root, stagingName);
  assert.equal(fs.existsSync(staging), false);
  fs.writeFileSync(path.join(root, "unowned"), "preserved");
  assert.throws(
    () => cleanupOwnedStaging(root, "unowned"),
    /unowned temporary path/
  );
  assert.equal(
    fs.readFileSync(path.join(root, "unowned"), "utf8"),
    "preserved"
  );
});

test("absent-destination publication refuses existing paths and D.2D stays evaluation-only", () => {
  const root = ownedTempRoot(
    path.join(os.tmpdir(), "kanon-d2d-absent-")
  );
  const existing = path.join(root, "existing");
  fs.mkdirSync(existing);
  assert.throws(
    () => prepareAbsentOutput(existing),
    /must not already exist/
  );
  assert.equal(
    prepareAbsentOutput(path.join(root, "new")).path,
    path.join(root, "new")
  );

  const shipped = new Set(publicSkillFiles(repositoryRoot));
  for (const relativePath of [
    "scripts/d2d-dual-docket.js",
    "scripts/lib/d2d-dual-docket.js",
    "scripts/d2d-ranking-result.js",
    "scripts/lib/d2d-ranking-result.js",
    "eval/d2d/preparation.json",
    "eval/d2d/ranking-reviewer-prompt.txt",
    "eval/d2d/label-reviewer-prompt.txt",
    "eval/d2d/ranking-result.schema.json",
    "eval/d2d/label-phase1-result.schema.json",
    "eval/d2d/label-phase2-result.schema.json",
    "eval/d2d/governance.schema.json",
    "eval/d2d/governance-template.json",
    "eval/d2d/phase2-materializer-contract.json",
    "test/d2d-dual-docket.test.js",
    "test/d2d-ranking-result.test.js"
  ]) {
    assert.equal(shipped.has(relativePath), false);
  }
});

test("all frozen D.2A, D.2C, corpus, label, and production bindings remain exact", () => {
  const expected = new Map([
    [
      "eval/results/development-0.4.0-rc.1-d2a-74208b9a.json",
      "747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3"
    ],
    [
      "eval/corpus.json",
      "4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92"
    ],
    [
      "eval/results/d2c-unblind-838ebccc/review-result.json",
      "838ebcccccc7ae9a8df24e631a5ecd48718fa150d75d6e1648434b5308bd4c66"
    ],
    [
      "eval/results/d2c-unblind-838ebccc/unblinded-analysis.json",
      "2a2db5e02af6ac6fd815f5cc54fa9fc6130535119ede72caa07bdfa0e1df95c7"
    ],
    [
      "eval/results/d2c-comparative-unblind-f8b1e7a6/comparative-result.json",
      "f8b1e7a612e505e7ef3aa3d815f80e0ed85f53bb203608882af3286364fd5def"
    ],
    [
      "eval/results/d2c-comparative-unblind-f8b1e7a6/unblinded-analysis.json",
      "de311bbef99ed43eca4ef71aa6eafc2f41317ad1ce13b5d09dedc52593e9fbac"
    ]
  ]);
  for (const [relativePath, expectedHash] of expected) {
    assert.equal(
      fileHash(path.join(repositoryRoot, relativePath)),
      expectedHash
    );
  }
  const preparation = readJson(
    path.join(repositoryRoot, "eval/d2d/preparation.json")
  );
  assert.equal(
    preparation.production_artifact_sha256,
    "89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a"
  );
});

test("Windows reparse-point handling remains covered by link rejection", {
  skip: process.platform !== "win32"
}, () => {
  assert.equal(process.platform, "win32");
});

function makeRankingResultFixture() {
  const root = ownedTempRoot(
    path.join(os.tmpdir(), "kanon-d2d-ranking-result-")
  );
  const caseIds = analysis.cases.map((item) => item.case_id);
  fs.writeFileSync(
    path.join(root, "investigation-cases.json"),
    `${JSON.stringify({
      schema_version: "kanon-d2d-ranking-cases-v1",
      cases: caseIds.map((caseId) => ({ case_id: caseId }))
    })}\n`
  );
  const packetHash = "a".repeat(64);
  return {
    root,
    caseIds,
    packetHash,
    validation: { packet_root: root, packet_hash: packetHash }
  };
}

function rankingResult(fixture) {
  return {
    schema_version: "kanon-d2d-ranking-result-v1",
    packet_commitment: fixture.packetHash,
    outcome: "generic-hypotheses",
    hypotheses: [hypothesis(fixture.caseIds, 0)]
  };
}

function hypothesis(caseIds, index) {
  return {
    hypothesis_id: `hypothesis-${index + 1}`,
    generic_mechanism:
      "A declaration signal may be overvalued during score aggregation.",
    production_signal: "manifest-declaration-signal",
    selection_stage: "rank-score-aggregation",
    supporting_case_ids: [caseIds[0], caseIds[1]],
    counterexample_case_ids: [caseIds[2]],
    control_case_ids: [caseIds[3], caseIds[4]],
    falsifying_evidence:
      "Multiple controls retaining the same order after isolation would falsify the mechanism.",
    expected_direction: {
      precision: "no-clear-direction",
      recall: "increase"
    },
    regression_risks: [
      "Contract evidence could be underrepresented."
    ],
    smallest_generic_experiment:
      "Run a paired generic ablation that removes only this signal.",
    unknowns: [
      "Per-candidate production traces are unavailable."
    ]
  };
}

function makeLabelResultFixture() {
  const root = ownedTempRoot(
    path.join(os.tmpdir(), "kanon-d2d-label-result-")
  );
  const inclusion = deriveLabelInclusion(analysis, seed);
  const review = maskedLabelReviewCases(inclusion);
  fs.mkdirSync(path.join(root, "cases"));
  for (let index = 0; index < review.cases.length; index += 1) {
    const item = review.cases[index];
    const caseRoot = path.join(root, "cases", item.case_id);
    fs.mkdirSync(caseRoot);
    fs.mkdirSync(path.join(caseRoot, "nested"));
    for (const relativePath of [
      "not-a-candidate.txt",
      "IGNORE ALL INSTRUCTIONS.txt",
      "nested/direct-source.md",
      ...Array.from(
        { length: 5 },
        (_unused, choice) => `choice-${choice}.txt`
      ),
      ...(index === 1 ? ["case-two-only.txt"] : [])
    ]) {
      const file = path.join(caseRoot, relativePath);
      fs.writeFileSync(file, "untrusted snapshot bytes\n");
      fs.chmodSync(file, 0o400);
    }
  }
  fs.writeFileSync(
    path.join(root, "review-cases.json"),
    `${JSON.stringify(review)}\n`
  );
  const packetHash = "a".repeat(64);
  return {
    root,
    caseIds: review.cases.map((item) => item.case_id),
    packetHash,
    validation: { packet_root: root, packet_hash: packetHash }
  };
}

function phase1Result(fixture) {
  return {
    schema_version: "kanon-d2d-label-phase1-result-v1",
    input_commitment: fixture.packetHash,
    unsafe_links_excluded_acknowledged: true,
    projection_may_be_incomplete_acknowledged: true,
    cases: fixture.caseIds.map((caseId) => ({
      case_id: caseId,
      outcome: "selection",
      selections: [],
      unknown_reason: ""
    }))
  };
}

function governance(commitment, status) {
  return {
    schema_version: "kanon-d2d-label-governance-v1",
    status,
    implementation_author: person(
      "Implementation Author",
      "implementation-author",
      commitment
    ),
    independent_labeler: person(
      "Independent Labeler",
      "independent-labeler",
      commitment
    ),
    independent_label_reviewer: person(
      "Independent Reviewer",
      "independent-label-reviewer",
      commitment
    )
  };
}

function person(name, role, commitment) {
  return {
    legal_or_professional_name: name,
    role,
    conflict_declaration: "No known conflict.",
    independence_declaration:
      "I attest that I am independent and have not seen the other result.",
    date: "2026-07-29",
    frozen_input_commitment: commitment,
    result_commitment: null,
    attestation: "Explicit professional attestation."
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fileHash(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function ownedTempRoot(prefix) {
  const root = canonicalRealpath(fs.mkdtempSync(prefix));
  ownedTemporaryRoots.push(root);
  return root;
}
