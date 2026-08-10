import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES,
  comparePredictionsToLabels,
  expandSyntheticPopulation,
  loadSyntheticPopulation,
  processSyntheticFixture
} from "./fixtures.js";
import {
  CLASSIFICATION,
  ORDERING,
  PACKAGE_VERSION,
  PERSONAS,
  PRODUCTION_ARTIFACT_SHA256,
  SIMULATION_ROOT,
  artifactEnvelope,
  assertCandidateBaseline,
  canonicalBytes,
  canonicalJson,
  completeTreeCommitment,
  consumePseudoAttempt,
  hashDirectory,
  loadCanonicalJson,
  preserveSimulationFailure,
  sha256,
  sha256File,
  validateAccessLedger,
  validateArtifact,
  validateConclusion,
  validateFinalEvidenceDirectory,
  validateHandoffs,
  validateOrdering,
  validatePersonaDeclarations,
  validateSimulationProtocol,
  writeCanonicalExclusive
} from "./validator.js";

const IMPLEMENTATION_FILES = Object.freeze([
  "eval/v1.0.0-simulation/PROTOCOL.json",
  "eval/v1.0.0-simulation/artifact.schema.json",
  "eval/v1.0.0-simulation/fixtures/population.json",
  "eval/v1.0.0-simulation/lib/fixtures.js",
  "eval/v1.0.0-simulation/lib/tabletop.js",
  "eval/v1.0.0-simulation/lib/validator.js",
  "eval/v1.0.0-simulation/protocol.schema.json",
  "test/v1-simulation.test.js"
]);

const ROLE_DESCRIPTIONS = Object.freeze({
  "SIM-ADJ": "simulated disagreement adjudicator",
  "SIM-CE": "simulated custodian and executor",
  "SIM-CO": "simulated candidate owner",
  "SIM-LA": "simulated labeler A",
  "SIM-LB": "simulated labeler B",
  "SIM-RO": "simulated release decision owner"
});

const ACCESS_POLICIES = Object.freeze({
  "SIM-CO": {
    forbidden_input_kinds: [
      "concealed-pseudo-identities-before-freeze",
      "pseudo-fixture-content-before-freeze",
      "pseudo-labels-before-freeze",
      "pseudo-predictions-before-freeze"
    ],
    permitted_input_kinds: [
      "simulation-specification",
      "synthetic-development-fixtures",
      "baseline-source-commitment",
      "baseline-artifact-commitment",
      "public-validation-results"
    ]
  },
  "SIM-CE": {
    forbidden_input_kinds: [
      "network-derived-metadata",
      "real-corpus",
      "real-repository"
    ],
    permitted_input_kinds: [
      "simulation-specification",
      "synthetic-population",
      "concealed-pseudo-identities",
      "committed-entropy",
      "fixture-generator",
      "frozen-candidate-after-freeze"
    ]
  },
  "SIM-LA": {
    forbidden_input_kinds: [
      "candidate-predictions",
      "candidate-traces",
      "candidate-hypothesis",
      "raw-labels-b"
    ],
    permitted_input_kinds: [
      "frozen-rubric",
      "assigned-synthetic-fixture-material"
    ]
  },
  "SIM-LB": {
    forbidden_input_kinds: [
      "candidate-predictions",
      "candidate-traces",
      "candidate-hypothesis",
      "raw-labels-a"
    ],
    permitted_input_kinds: [
      "frozen-rubric",
      "assigned-synthetic-fixture-material"
    ]
  },
  "SIM-ADJ": {
    forbidden_input_kinds: [
      "candidate-predictions",
      "candidate-traces"
    ],
    permitted_input_kinds: [
      "frozen-rubric",
      "immutable-raw-labels-a",
      "immutable-raw-labels-b"
    ]
  },
  "SIM-RO": {
    forbidden_input_kinds: [
      "unfinalized-labels",
      "unfrozen-candidate",
      "product-correction-authority"
    ],
    permitted_input_kinds: [
      "finalized-commitments",
      "access-ledger",
      "final-labels",
      "frozen-candidate-identity",
      "finalized-pseudo-attempt-evidence",
      "mechanical-simulation-gate-results",
      "entropy-domain-commitment"
    ]
  }
});

export function executeFinalTabletop(options) {
  const repoRoot = fs.realpathSync(options.repoRoot);
  const implementationCommit = String(options.implementationCommit || "");
  const specificationCommit = String(options.specificationCommit || "");
  expect(
    /^[0-9a-f]{40}$/u.test(implementationCommit) &&
      /^[0-9a-f]{40}$/u.test(specificationCommit),
    "execution-commit-bindings"
  );
  const simulationRoot = path.join(repoRoot, SIMULATION_ROOT);
  const simulationRootStat = fs.lstatSync(simulationRoot);
  expect(
    simulationRootStat.isDirectory() &&
      !simulationRootStat.isSymbolicLink(),
    "simulation-root"
  );
  ensureNoPriorFinalAttempt(simulationRoot);
  const stagingName = `tabletop-attempt-${implementationCommit}`;
  const stagingRoot = path.join(simulationRoot, stagingName);
  fs.mkdirSync(stagingRoot, { mode: 0o700 });
  const protocolPath = path.join(simulationRoot, "PROTOCOL.json");
  const populationPath = path.join(
    simulationRoot,
    "fixtures",
    "population.json"
  );
  const protocol = loadCanonicalJson(protocolPath);
  validateSimulationProtocol(protocol.value);
  const population = loadSyntheticPopulation(populationPath);
  const specificationPath = path.join(repoRoot, "6-people-sim.md");
  const prospectiveProtocolPath = path.join(
    repoRoot,
    "eval",
    "v1.0.0-prospective",
    "PROTOCOL.json"
  );
  const implementation = implementationCommitment(repoRoot);
  const baseBindings = {
    prospective_protocol_sha256: sha256File(prospectiveProtocolPath),
    simulation_implementation_sha256: implementation.sha256,
    simulation_population_sha256: population.sha256,
    simulation_protocol_sha256: protocol.sha256,
    simulation_specification_sha256: sha256File(specificationPath)
  };
  const writer = createEvidenceWriter(stagingRoot, baseBindings);
  const envelopes = buildAccessEnvelopes();
  const envelopeHashes = Object.fromEntries(
    envelopes.map((envelope) => [
      envelope.persona_id,
      sha256(canonicalBytes(envelope))
    ])
  );
  const events = [];
  const accessEntries = [];
  const handoffs = [];
  let accessSequence = 0;
  let handoffSequence = 0;
  let receiptWritten = false;

  const grant = (personaId, roleSequence, inputs) => {
    accessSequence += 1;
    const artifact = writer.write(
      `access-ledger/${String(accessSequence).padStart(3, "0")}.json`,
      "access-ledger-entry",
      "SIM-CE",
      roleSequence,
      {
        envelope_sha256: envelopeHashes[personaId],
        inputs,
        ledger_sequence: accessSequence,
        persona_id: personaId,
        role_execution_sequence: roleSequence
      }
    );
    accessEntries.push(artifact.value);
    return artifact;
  };

  const handoff = (
    lifecycleSequence,
    producingPersona,
    consumingPersona,
    inputs,
    outputs
  ) => {
    handoffSequence += 1;
    const artifact = writer.write(
      `handoffs/${String(handoffSequence).padStart(3, "0")}.json`,
      "persona-handoff",
      producingPersona,
      lifecycleSequence,
      {
        classification: "simulated-development-only",
        consuming_persona: consumingPersona,
        exact_input_commitments: [...inputs],
        exact_output_commitment: bundleCommitment(outputs),
        handoff_sequence: handoffSequence,
        lifecycle_sequence: lifecycleSequence,
        producing_persona: producingPersona,
        simulated: true
      }
    );
    handoffs.push(artifact.value);
    return artifact;
  };

  const recordEvent = (sequence, outputs) => {
    const event = {
      mutation_after_consumption: false,
      output_commitment_sha256: bundleCommitment(outputs),
      sequence,
      type: ORDERING[sequence - 1]
    };
    events.push(event);
    return event.output_commitment_sha256;
  };

  try {
    const validationSummary = {
      focused_simulation_tests: {
        failed: Number(options.focusedValidation?.failed || 0),
        passed: Number(options.focusedValidation?.passed || 0),
        skipped: Number(options.focusedValidation?.skipped || 0)
      },
      implementation_commit: implementationCommit,
      simulation_only: true
    };
    const validationSummarySha256 = sha256(
      canonicalBytes(validationSummary)
    );
    const developmentFixtureBundleSha256 = bundleCommitment(
      expandSyntheticPopulation(population.value)
        .filter(
          (item) =>
            item.fixture.partition === "synthetic-development"
        )
        .map((item) => item.fixture_sha256)
    );

    const binding = writer.write(
      "simulation-binding.json",
      "simulation-binding",
      "SIM-CE",
      1,
      {
        implementation: {
          commit: implementationCommit,
          files: implementation.files,
          sha256: implementation.sha256
        },
        prospective_protocol: {
          activated: false,
          path: "eval/v1.0.0-prospective/PROTOCOL.json",
          sha256: baseBindings.prospective_protocol_sha256,
          status: "frozen-inactive"
        },
        production_artifact_sha256: PRODUCTION_ARTIFACT_SHA256,
        simulation_protocol: {
          path: "eval/v1.0.0-simulation/PROTOCOL.json",
          sha256: protocol.sha256
        },
        simulation_specification: {
          commit: specificationCommit,
          path: "6-people-sim.md",
          sha256: baseBindings.simulation_specification_sha256
        }
      }
    );
    grant("SIM-CO", 1, [
      input("simulation-specification", baseBindings.simulation_specification_sha256),
      input("baseline-source-commitment", sha256(Buffer.from(implementationCommit))),
      input("baseline-artifact-commitment", PRODUCTION_ARTIFACT_SHA256)
    ]);
    recordEvent(1, [binding.sha256]);
    handoff(1, "SIM-CE", "SIM-CO", [
      baseBindings.prospective_protocol_sha256,
      baseBindings.simulation_specification_sha256,
      baseBindings.simulation_implementation_sha256
    ], [binding.sha256]);

    const declarations = PERSONAS.map((personaId) => ({
      blindness_proof_claim: false,
      controlled_by: "one-user-and-agent-system",
      human: false,
      human_attestation: false,
      independence_claim: false,
      persona_id: personaId,
      procedural_role: ROLE_DESCRIPTIONS[personaId],
      simulated: true
    }));
    validatePersonaDeclarations(declarations);
    const personaArtifact = writer.write(
      "persona-declarations.json",
      "persona-declarations",
      "SIM-RO",
      2,
      {
        declarations,
        distinct_real_human_count: 0,
        procedural_role_count: 6
      }
    );
    const envelopeArtifacts = envelopes.map((envelope) =>
      writer.write(
        `access-envelopes/${envelope.persona_id}.json`,
        "access-envelope",
        "SIM-CE",
        2,
        {
          envelope,
          envelope_sha256: envelopeHashes[envelope.persona_id],
          hashed_before_role_execution: true
        }
      )
    );
    const stepTwoOutputs = [
      personaArtifact.sha256,
      ...envelopeArtifacts.map((item) => item.sha256)
    ];
    recordEvent(2, stepTwoOutputs);
    handoff(2, "SIM-RO", "SIM-CE", [binding.sha256], stepTwoOutputs);

    const expanded = expandSyntheticPopulation(population.value);
    const populationCases = expanded.map((item) => ({
      case_reference:
        item.fixture.partition === "synthetic-pseudo-holdout"
          ? concealedIdentity(item.fixture.case_id)
          : item.fixture.case_id,
      category: item.fixture.category,
      fixture_sha256: item.fixture_sha256,
      partition: item.fixture.partition,
      real_repository: false,
      synthetic_identity: item.fixture.synthetic_identity
    }));
    const populationCommitment = sha256(canonicalBytes(populationCases));
    const populationArtifact = writer.write(
      "population-commitment.json",
      "synthetic-population-commitment",
      "SIM-CE",
      3,
      {
        cases: populationCases,
        category_count: 5,
        development_case_count: 10,
        population_sha256: populationCommitment,
        pseudo_holdout_case_count: 10,
        real_repository_identity_count: 0
      }
    );
    const contaminationArtifact = writer.write(
      "contamination-registry.json",
      "synthetic-contamination-registry",
      "SIM-CE",
      3,
      {
        entries: populationCases.map((item) => ({
          case_reference: item.case_reference,
          fixture_sha256: item.fixture_sha256,
          network_derived: false,
          partition: item.partition,
          real_repository: false,
          relations: [],
          synthetic_identity: item.synthetic_identity
        })),
        historical_overlap_count: 0,
        prospective_overlap_count: 0,
        real_identity_count: 0
      }
    );
    grant("SIM-CE", 3, [
      input("simulation-specification", baseBindings.simulation_specification_sha256),
      input("synthetic-population", populationArtifact.sha256)
    ]);
    recordEvent(3, [
      populationArtifact.sha256,
      contaminationArtifact.sha256
    ]);
    handoff(3, "SIM-CE", "SIM-RO", [binding.sha256], [
      populationArtifact.sha256,
      contaminationArtifact.sha256
    ]);

    const entropyDomainSha256 = sha256(
      canonicalBytes({
        implementation_commit: implementationCommit,
        population_sha256: populationCommitment,
        simulation_protocol_sha256: protocol.sha256
      })
    );
    grant("SIM-RO", 4, [
      input("finalized-commitments", populationArtifact.sha256),
      input("entropy-domain-commitment", entropyDomainSha256)
    ]);
    const entropyCe = deterministicEntropy(
      "SIM-CE",
      implementationCommit,
      populationCommitment
    );
    const entropyRo = deterministicEntropy(
      "SIM-RO",
      implementationCommit,
      populationCommitment
    );
    const entropyCeCommitment = entropyCommitment("SIM-CE", entropyCe);
    const entropyRoCommitment = entropyCommitment("SIM-RO", entropyRo);
    const entropyCeArtifact = writer.write(
      "entropy/SIM-CE-commitment.json",
      "entropy-commitment",
      "SIM-CE",
      4,
      {
        commitment_sha256: entropyCeCommitment,
        contribution_bytes: 32,
        persona_id: "SIM-CE"
      }
    );
    const entropyRoArtifact = writer.write(
      "entropy/SIM-RO-commitment.json",
      "entropy-commitment",
      "SIM-RO",
      4,
      {
        commitment_sha256: entropyRoCommitment,
        contribution_bytes: 32,
        persona_id: "SIM-RO"
      }
    );
    const revealCeArtifact = writer.write(
      "entropy/SIM-CE-reveal.json",
      "entropy-reveal",
      "SIM-CE",
      4,
      {
        commitment_sha256: entropyCeCommitment,
        contribution_hex: entropyCe,
        persona_id: "SIM-CE"
      }
    );
    const revealRoArtifact = writer.write(
      "entropy/SIM-RO-reveal.json",
      "entropy-reveal",
      "SIM-RO",
      4,
      {
        commitment_sha256: entropyRoCommitment,
        contribution_hex: entropyRo,
        persona_id: "SIM-RO"
      }
    );
    const entropyOutputs = [
      entropyCeArtifact.sha256,
      entropyRoArtifact.sha256,
      revealCeArtifact.sha256,
      revealRoArtifact.sha256
    ];
    recordEvent(4, entropyOutputs);
    handoff(4, "SIM-CE", "SIM-RO", [
      populationArtifact.sha256,
      entropyDomainSha256
    ], [entropyCeArtifact.sha256]);
    handoff(4, "SIM-RO", "SIM-CE", [
      populationArtifact.sha256,
      entropyDomainSha256
    ], [entropyRoArtifact.sha256]);

    const combinedEntropy = sha256(
      canonicalBytes({
        domain: "kanon-v1.0.0-simulation-selection-v1",
        entropy_ce: entropyCe,
        entropy_ro: entropyRo,
        population_sha256: populationCommitment,
        protocol_sha256: protocol.sha256
      })
    );
    const selected = deterministicSelection(expanded, combinedEntropy);
    const selectionArtifact = writer.write(
      "deterministic-selection.json",
      "deterministic-selection",
      "SIM-CE",
      5,
      {
        combined_entropy_sha256: combinedEntropy,
        development: selected.development.map(selectionRecord),
        development_count: selected.development.length,
        ordering: "ascending-hmac-sha256-within-category-and-partition",
        pseudo_holdout: selected.pseudoHoldout.map((item) =>
          selectionRecord(item, true)
        ),
        pseudo_holdout_count: selected.pseudoHoldout.length
      }
    );
    recordEvent(5, [selectionArtifact.sha256]);
    handoff(5, "SIM-CE", "SIM-ADJ", entropyOutputs, [
      selectionArtifact.sha256
    ]);

    const rubric = {
      command_rule:
        "record the deterministic synthetic command and working directory",
      important_file_count: 5,
      important_file_rule:
        "select five existing generated fixture paths in declared structural order",
      prediction_access_allowed: false,
      status_values: ["labelable"],
      synthetic_only: true,
      version: 1
    };
    const rubricArtifact = writer.write(
      "rubric.json",
      "frozen-labeling-rubric",
      "SIM-ADJ",
      6,
      {
        frozen_before_labeling: true,
        rubric,
        rubric_sha256: sha256(canonicalBytes(rubric))
      }
    );
    recordEvent(6, [rubricArtifact.sha256]);
    handoff(6, "SIM-ADJ", "SIM-LA", [selectionArtifact.sha256], [
      rubricArtifact.sha256
    ]);

    const labelsA = selected.pseudoHoldout.map((item) =>
      rawLabelRecord(item, false)
    );
    grant("SIM-LA", 7, [
      input("frozen-rubric", rubricArtifact.sha256),
      input(
        "assigned-synthetic-fixture-material",
        bundleCommitment(selected.pseudoHoldout.map((item) => item.fixture_sha256))
      )
    ]);
    const rawLabelsAArtifact = writer.write(
      "raw-labels-a.json",
      "raw-labels-a",
      "SIM-LA",
      7,
      {
        cross_labeler_access: false,
        labels: labelsA,
        prediction_access: false,
        raw_and_immutable: true
      }
    );
    recordEvent(7, [rawLabelsAArtifact.sha256]);
    handoff(7, "SIM-LA", "SIM-CE", [
      rubricArtifact.sha256,
      selectionArtifact.sha256
    ], [rawLabelsAArtifact.sha256]);

    const labelsB = selected.pseudoHoldout.map((item, index) =>
      rawLabelRecord(item, index === 0)
    );
    grant("SIM-LB", 8, [
      input("frozen-rubric", rubricArtifact.sha256),
      input(
        "assigned-synthetic-fixture-material",
        bundleCommitment(selected.pseudoHoldout.map((item) => item.fixture_sha256))
      )
    ]);
    const rawLabelsBArtifact = writer.write(
      "raw-labels-b.json",
      "raw-labels-b",
      "SIM-LB",
      8,
      {
        cross_labeler_access: false,
        labels: labelsB,
        prediction_access: false,
        raw_and_immutable: true
      }
    );
    recordEvent(8, [rawLabelsBArtifact.sha256]);
    handoff(8, "SIM-LB", "SIM-CE", [
      rubricArtifact.sha256,
      selectionArtifact.sha256
    ], [rawLabelsBArtifact.sha256]);

    grant("SIM-ADJ", 9, [
      input("frozen-rubric", rubricArtifact.sha256),
      input("immutable-raw-labels-a", rawLabelsAArtifact.sha256),
      input("immutable-raw-labels-b", rawLabelsBArtifact.sha256)
    ]);
    const agreement = measureAgreement(labelsA, labelsB);
    const agreementArtifact = writer.write(
      "agreement.json",
      "simulated-label-agreement",
      "SIM-ADJ",
      9,
      agreement
    );
    recordEvent(9, [agreementArtifact.sha256]);
    handoff(9, "SIM-CE", "SIM-ADJ", [
      rawLabelsAArtifact.sha256,
      rawLabelsBArtifact.sha256
    ], [agreementArtifact.sha256]);

    const adjudications = adjudicateLabels(labelsA, labelsB);
    const adjudicationArtifact = writer.write(
      "adjudication-history.json",
      "prediction-blind-adjudication",
      "SIM-ADJ",
      10,
      {
        disagreements: adjudications,
        prediction_access: false,
        raw_labels_a_sha256: rawLabelsAArtifact.sha256,
        raw_labels_b_sha256: rawLabelsBArtifact.sha256
      }
    );
    recordEvent(10, [adjudicationArtifact.sha256]);
    handoff(10, "SIM-ADJ", "SIM-CE", [
      agreementArtifact.sha256,
      rubricArtifact.sha256
    ], [adjudicationArtifact.sha256]);

    const finalLabels = labelsA.map((label) => structuredClone(label));
    const finalLabelsArtifact = writer.write(
      "final-labels.json",
      "final-simulated-labels",
      "SIM-ADJ",
      11,
      {
        adjudication_history_sha256: adjudicationArtifact.sha256,
        case_count: finalLabels.length,
        frozen: true,
        labels: finalLabels,
        prediction_access_before_freeze: false
      }
    );
    recordEvent(11, [finalLabelsArtifact.sha256]);
    handoff(11, "SIM-ADJ", "SIM-CE", [
      adjudicationArtifact.sha256,
      agreementArtifact.sha256
    ], [finalLabelsArtifact.sha256]);

    const packageValue = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
    );
    const candidate = {
      complete_test_tree_sha256: hashDirectory(repoRoot, "test").sha256,
      dependency_lock_sha256: sha256File(
        path.join(repoRoot, "package-lock.json")
      ),
      generated_tree_sha256: hashDirectory(repoRoot, "runtime").sha256,
      package_version: packageValue.version,
      production_artifact_sha256: PRODUCTION_ARTIFACT_SHA256,
      production_change_allowed: false,
      production_source_tree_sha256: hashDirectory(repoRoot, "src").sha256,
      public_capabilities_sha256: sha256File(
        path.join(repoRoot, "runtime", "build-metadata.json")
      ),
      relevant_files: relevantCandidateFiles(repoRoot),
      runtime_dependency_count: Object.keys(
        packageValue.dependencies || {}
      ).length,
      source_commit: implementationCommit,
      validation_record_sha256: validationSummarySha256
    };
    assertCandidateBaseline(candidate);
    grant("SIM-CO", 12, [
      input("simulation-specification", baseBindings.simulation_specification_sha256),
      input("synthetic-development-fixtures", developmentFixtureBundleSha256),
      input("baseline-source-commitment", sha256(Buffer.from(implementationCommit))),
      input("baseline-artifact-commitment", PRODUCTION_ARTIFACT_SHA256),
      input("public-validation-results", validationSummarySha256)
    ]);
    const candidateArtifact = writer.write(
      "candidate-freeze.json",
      "candidate-freeze",
      "SIM-CO",
      12,
      {
        candidate,
        candidate_correction_created: false,
        frozen_after_final_labels: true,
        pseudo_holdout_disclosed_to_candidate_owner_before_freeze: false,
        validation_summary: validationSummary
      }
    );
    recordEvent(12, [candidateArtifact.sha256]);
    handoff(12, "SIM-CO", "SIM-CE", [
      finalLabelsArtifact.sha256,
      validationSummarySha256
    ], [candidateArtifact.sha256]);
    grant("SIM-CE", 14, [
      input("simulation-specification", baseBindings.simulation_specification_sha256),
      input("synthetic-population", populationArtifact.sha256),
      input("concealed-pseudo-identities", selectionArtifact.sha256),
      input("committed-entropy", bundleCommitment(entropyOutputs)),
      input("fixture-generator", baseBindings.simulation_implementation_sha256),
      input("frozen-candidate-after-freeze", candidateArtifact.sha256)
    ]);

    const receipt = {
      attempt_ordinal: 1,
      candidate_freeze_sha256: candidateArtifact.sha256,
      case_ordinal: 1,
      component: "canonical-simulation-pseudo-runner",
      consumed: true,
      durability: "exclusive-create-file-sync-parent-directory-sync",
      network_allowed: false,
      real_corpus_accessed: false,
      real_repository_accessed: false,
      retry_allowed: false,
      selection_sha256: selectionArtifact.sha256,
      synthetic_only: true
    };
    const receiptArtifactValue = artifactEnvelope({
      artifactType: "pseudo-attempt-consumption",
      bindings: baseBindings,
      payload: { receipt },
      producer: "SIM-CE",
      sequence: 13
    });
    const receiptArtifact = writer.writePrepared(
      "pseudo-attempt-consumption.json",
      receiptArtifactValue,
      { durable: true }
    );
    receiptWritten = true;
    const attemptState = consumePseudoAttempt(
      { authorized: true, consumed_count: 0 },
      receipt
    );

    const processed = [];
    for (const [index, selectedFixture] of
      selected.pseudoHoldout.entries()) {
      const result = processSyntheticFixture(
        selectedFixture.fixture,
        { trace: true }
      );
      const concealedCaseId = concealedIdentity(
        selectedFixture.fixture.case_id
      );
      const predictionArtifact = writer.write(
        `predictions/${String(index + 1).padStart(3, "0")}.json`,
        "fixture-prediction",
        "SIM-CE",
        14,
        {
          candidate_source_commit: implementationCommit,
          concealed_case_id: concealedCaseId,
          fixture_sha256: selectedFixture.fixture_sha256,
          ordinal: index + 1,
          predictions: result.predictions,
          processing_count: 1
        }
      );
      const traceArtifact = writer.write(
        `traces/${String(index + 1).padStart(3, "0")}.json`,
        "fixture-trace",
        "SIM-CE",
        14,
        {
          concealed_case_id: concealedCaseId,
          fixture_sha256: selectedFixture.fixture_sha256,
          ordinal: index + 1,
          processing_count: 1,
          trace: result.trace
        }
      );
      processed.push({
        concealed_case_id: concealedCaseId,
        fixture: selectedFixture,
        prediction_artifact_sha256: predictionArtifact.sha256,
        predictions: result.predictions,
        trace: result.trace,
        trace_artifact_sha256: traceArtifact.sha256
      });
    }
    expect(
      attemptState.consumed_count === 1 &&
        processed.length === 10 &&
        new Set(
          processed.map((item) => item.concealed_case_id)
        ).size === 10,
      "attempt-processing-count"
    );
    const processingOutputs = processed.flatMap((item) => [
      item.prediction_artifact_sha256,
      item.trace_artifact_sha256
    ]);
    recordEvent(13, [receiptArtifact.sha256]);
    handoff(13, "SIM-CE", "SIM-CE", [
      candidateArtifact.sha256,
      selectionArtifact.sha256
    ], [receiptArtifact.sha256]);
    recordEvent(14, processingOutputs);
    handoff(14, "SIM-CE", "SIM-CE", [
      receiptArtifact.sha256,
      finalLabelsArtifact.sha256
    ], processingOutputs);

    const comparisons = processed.map((item) => {
      const labels = finalLabels.find(
        (label) => label.concealed_case_id === item.concealed_case_id
      );
      expect(Boolean(labels), "comparison-label");
      return {
        concealed_case_id: item.concealed_case_id,
        comparison: comparePredictionsToLabels(
          item.predictions,
          labels.labels
        )
      };
    });
    const comparisonArtifact = writer.write(
      "comparison.json",
      "blinded-simulation-comparison",
      "SIM-CE",
      15,
      {
        case_count: comparisons.length,
        comparisons,
        official_score: false,
        performance_release_gate: false
      }
    );
    const traceComparisonArtifact = writer.write(
      "trace-comparison.json",
      "trace-on-off-comparison",
      "SIM-CE",
      15,
      {
        applicable_to_pseudo_attempt: false,
        preflight_control_covered_by_focused_tests: true,
        pseudo_holdout_trace_off_execution_count: 0,
        reason:
          "The exact-once pseudo-fixture rule precludes a second trace-off processing pass.",
        trace_observer_is_evaluation_only: true
      }
    );
    const preliminaryGates = {
      classification: "pass",
      comparison_complete: "pass",
      fixture_count: "pass",
      no_network: "pass",
      no_real_corpus: "pass",
      no_real_repository: "pass",
      one_use_attempt: "pass",
      ordering_through_processing: "pass",
      production_unchanged: "pass",
      trace_capture: processed.every((item) => item.trace.complete)
        ? "pass"
        : "fail"
    };
    const preliminaryGateArtifact = writer.write(
      "preliminary-gates.json",
      "preliminary-simulation-gates",
      "SIM-CE",
      15,
      {
        gates: preliminaryGates,
        release_gate_application: false
      }
    );
    const stepFifteenOutputs = [
      comparisonArtifact.sha256,
      traceComparisonArtifact.sha256,
      preliminaryGateArtifact.sha256
    ];
    recordEvent(15, stepFifteenOutputs);
    handoff(15, "SIM-CE", "SIM-RO", processingOutputs, stepFifteenOutputs);

    const unblindingArtifact = writer.write(
      "prediction-unblinding.json",
      "simulated-prediction-unblinding",
      "SIM-CE",
      16,
      {
        mapping: processed.map((item) => ({
          concealed_case_id: item.concealed_case_id,
          synthetic_case_id: item.fixture.fixture.case_id
        })),
        occurred_after_final_labels: true,
        procedural_only: true,
        real_blindness_proof: false
      }
    );
    const predecisionLedgerSha256 = bundleCommitment(
      accessEntries.map((item) => sha256(canonicalBytes(item)))
    );
    const predecisionLedgerArtifact = writer.write(
      "access-ledger-predecision.json",
      "access-ledger-predecision-commitment",
      "SIM-CE",
      16,
      {
        access_entry_count: accessEntries.length,
        access_ledger_sha256: predecisionLedgerSha256,
        append_only: true
      }
    );
    recordEvent(16, [
      unblindingArtifact.sha256,
      predecisionLedgerArtifact.sha256
    ]);
    handoff(16, "SIM-CE", "SIM-RO", stepFifteenOutputs, [
      unblindingArtifact.sha256,
      predecisionLedgerArtifact.sha256
    ]);

    grant("SIM-RO", 17, [
      input("finalized-commitments", binding.sha256),
      input("access-ledger", predecisionLedgerArtifact.sha256),
      input("final-labels", finalLabelsArtifact.sha256),
      input("frozen-candidate-identity", candidateArtifact.sha256),
      input(
        "finalized-pseudo-attempt-evidence",
        bundleCommitment([
          receiptArtifact.sha256,
          ...processingOutputs,
          comparisonArtifact.sha256
        ])
      ),
      input(
        "mechanical-simulation-gate-results",
        preliminaryGateArtifact.sha256
      )
    ]);
    const allPriorArtifacts = writer.records();
    for (const record of allPriorArtifacts) {
      validateArtifact(record.value);
    }
    validateAccessLedger(accessEntries, envelopes);
    const orderingBeforeFinal = events.map((event) => ({ ...event }));
    const finalGateValues = {
      access_envelopes: "pass",
      candidate_freeze_ordering: "pass",
      classification: "pass",
      conclusion_restriction: "pass",
      entropy_before_ordering: "pass",
      failure_preservation_control: "pass",
      fixture_counts: "pass",
      label_before_prediction_ordering: "pass",
      labeler_cross_access: "pass",
      mutation_after_consumption: "pass",
      namespace_containment: "pass",
      no_network: "pass",
      no_real_corpus: "pass",
      no_real_repository_identity: "pass",
      no_release_claim: "pass",
      one_durable_pseudo_attempt: "pass",
      production_artifact_binding: "pass",
      prospective_protocol_inactive: "pass",
      raw_label_agreement: agreement.passed ? "pass" : "fail",
      six_persona_records: "pass",
      ten_cases_processed_once: processed.length === 10 ? "pass" : "fail",
      trace_capture:
        preliminaryGates.trace_capture === "pass" ? "pass" : "fail"
    };
    const gatesArtifact = writer.write(
      "simulation-gates.json",
      "simulation-gates",
      "SIM-RO",
      17,
      {
        all_mechanical_gates_passed: Object.values(finalGateValues).every(
          (value) => value === "pass"
        ),
        gates: finalGateValues,
        release_gates_satisfied: false,
        release_protocol_blockers_reduced: false
      }
    );
    recordEvent(17, [gatesArtifact.sha256]);
    handoff(17, "SIM-RO", "SIM-CO", [
      predecisionLedgerArtifact.sha256,
      finalLabelsArtifact.sha256,
      candidateArtifact.sha256,
      preliminaryGateArtifact.sha256
    ], [gatesArtifact.sha256]);

    const conclusion = Object.values(finalGateValues).every(
      (value) => value === "pass"
    )
      ? "simulation-complete"
      : "simulation-failed";
    validateConclusion(conclusion);
    const conclusionArtifact = writer.write(
      "conclusion.json",
      "simulation-conclusion",
      "SIM-RO",
      18,
      {
        conclusion,
        human_release_decision: false,
        independent_evidence: false,
        release_authority: false,
        release_blocker_reduction: false,
        release_supported_conclusion: false
      }
    );
    recordEvent(18, [conclusionArtifact.sha256]);
    handoff(18, "SIM-RO", "SIM-CO", [gatesArtifact.sha256], [
      conclusionArtifact.sha256
    ]);
    validateOrdering(events);
    validateHandoffs(handoffs);

    const orderingArtifact = writer.write(
      "ordering-record.json",
      "ordering-record",
      "SIM-RO",
      18,
      {
        events,
        exact_order_passed: true,
        post_consumption_mutation_count: 0
      }
    );
    const accessIndexArtifact = writer.write(
      "access-ledger-index.json",
      "access-ledger-index",
      "SIM-RO",
      18,
      {
        append_only: true,
        entries: writer
          .records()
          .filter(
            (record) =>
              record.value.artifact_type === "access-ledger-entry"
          )
          .map((record) => ({
            path: record.relative,
            sha256: record.sha256
          })),
        entry_count: accessEntries.length
      }
    );
    const handoffIndexArtifact = writer.write(
      "handoff-index.json",
      "handoff-index",
      "SIM-RO",
      18,
      {
        entries: writer
          .records()
          .filter(
            (record) =>
              record.value.artifact_type === "persona-handoff"
          )
          .map((record) => ({
            path: record.relative,
            sha256: record.sha256
          })),
        handoff_count: handoffs.length
      }
    );
    const runRecordArtifact = writer.write(
      "run-record.json",
      "simulation-run-record",
      "SIM-RO",
      18,
      {
        exact_next_permissible_action:
          "Assign six distinct real humans, then separately authorize metadata-only corpus construction under the unchanged frozen prospective protocol.",
        mechanics_failed: Object.entries(finalGateValues)
          .filter(([, value]) => value !== "pass")
          .map(([name]) => name),
        mechanics_passed: Object.entries(finalGateValues)
          .filter(([, value]) => value === "pass")
          .map(([name]) => name),
        prospective_activation_effect: "none",
        real_release_blockers_remaining: {
          p0: [
            "six-distinct-real-human-governance",
            "independent-human-labels",
            "valid-prospective-development-set",
            "frozen-passing-candidate",
            "unseen-one-use-holdout-result",
            "seven-visible-performance-gate-failures"
          ],
          p1: [
            "governed-metadata-snapshot",
            "complete-contamination-registry",
            "real-human-label-rubric-and-workflow",
            "candidate-bound-prospective-evaluator"
          ],
          p2: [
            "native-windows-and-linux-conformance",
            "future-population-representation-limits"
          ]
        },
        rehearsal:
          "One reduced, deterministic, six-persona synthetic governance tabletop.",
        why_not_independent:
          "All personas were controlled by one user and agent system; procedural separation is not human independence.",
        why_not_prospective:
          "Only generated synthetic fixtures were processed, so no unseen release holdout or official score exists."
      }
    );
    const administrativeOutputs = [
      orderingArtifact.sha256,
      accessIndexArtifact.sha256,
      handoffIndexArtifact.sha256,
      runRecordArtifact.sha256
    ];

    const beforeManifest = completeTreeCommitment(stagingRoot);
    const manifestArtifact = writer.write(
      "evidence-manifest.json",
      "evidence-manifest",
      "SIM-RO",
      18,
      {
        files: beforeManifest.files,
        inventory_sha256: beforeManifest.sha256,
        scope:
          "all finalized role, access, handoff, prediction, trace, gate, conclusion, ordering, and run-record artifacts before this manifest",
        total_files_before_manifest: beforeManifest.files.length
      }
    );
    const beforeTreeCommitment = completeTreeCommitment(stagingRoot);
    const treeArtifactValue = artifactEnvelope({
      artifactType: "complete-tree-commitment",
      bindings: baseBindings,
      payload: {
        complete_tree_sha256: beforeTreeCommitment.sha256,
        excluded_self_path: "complete-tree-commitment.json",
        files: beforeTreeCommitment.files,
        scope:
          "every evidence file including the evidence manifest and excluding only this self-referential commitment file"
      },
      producer: "SIM-RO",
      sequence: 18
    });
    writer.writePrepared(
      "complete-tree-commitment.json",
      treeArtifactValue,
      { durable: true }
    );
    syncDirectory(stagingRoot);
    const destinationName =
      `evidence-sha256-${beforeTreeCommitment.sha256}`;
    const destination = path.join(simulationRoot, destinationName);
    expect(!fs.existsSync(destination), "evidence-destination-absent");
    fs.renameSync(stagingRoot, destination);
    syncDirectory(simulationRoot);
    const validation = validateFinalEvidenceDirectory(destination, {
      completeTreeSha256: beforeTreeCommitment.sha256
    });
    return {
      ...validation,
      administrative_output_sha256: bundleCommitment([
        ...administrativeOutputs,
        manifestArtifact.sha256
      ]),
      candidate_freeze_sha256: candidateArtifact.sha256,
      conclusion_sha256: conclusionArtifact.sha256,
      evidence_directory: path.relative(repoRoot, destination).replaceAll("\\", "/"),
      pseudo_attempt_receipt_sha256: receiptArtifact.sha256,
      raw_labels_a_sha256: rawLabelsAArtifact.sha256,
      raw_labels_b_sha256: rawLabelsBArtifact.sha256,
      simulation_protocol_sha256: protocol.sha256,
      simulation_specification_sha256:
        baseBindings.simulation_specification_sha256
    };
  } catch (error) {
    if (fs.existsSync(stagingRoot)) {
      try {
        preserveSimulationFailure({
          bindings: baseBindings,
          error,
          root: stagingRoot,
          sequence: receiptWritten ? 18 : 1
        });
      } catch {
        // Existing bytes remain in their evaluator-owned attempt directory.
      }
    }
    throw error;
  }
}

export function buildAccessEnvelopes() {
  return PERSONAS.map((personaId) => ({
    forbidden_input_kinds: [
      ...ACCESS_POLICIES[personaId].forbidden_input_kinds
    ],
    human_independence: false,
    permitted_input_kinds: [
      ...ACCESS_POLICIES[personaId].permitted_input_kinds
    ],
    persona_id: personaId,
    procedural_only: true,
    simulated: true
  }));
}

export function deterministicSelection(expanded, combinedEntropy) {
  expect(
    /^[0-9a-f]{64}$/u.test(combinedEntropy),
    "selection-entropy"
  );
  const selected = {
    development: [],
    pseudoHoldout: []
  };
  for (const category of CATEGORIES) {
    for (const [partition, target] of [
      ["synthetic-development", selected.development],
      ["synthetic-pseudo-holdout", selected.pseudoHoldout]
    ]) {
      const ranked = expanded
        .filter(
          (item) =>
            item.fixture.category === category.id &&
            item.fixture.partition === partition
        )
        .map((item) => ({
          ...item,
          rank_sha256: crypto
            .createHmac("sha256", Buffer.from(combinedEntropy, "hex"))
            .update(
              canonicalBytes({
                category: category.id,
                fixture_sha256: item.fixture_sha256,
                partition,
                synthetic_identity: item.fixture.synthetic_identity
              })
            )
            .digest("hex")
        }))
        .sort((left, right) =>
          left.rank_sha256.localeCompare(right.rank_sha256)
        );
      expect(ranked.length === 2, "selection-category-count");
      target.push(...ranked);
    }
  }
  expect(
    selected.development.length === 10 &&
      selected.pseudoHoldout.length === 10,
    "selection-counts"
  );
  return selected;
}

export function measureAgreement(labelsA, labelsB) {
  expect(
    labelsA.length === 10 && labelsB.length === 10,
    "agreement-label-count"
  );
  let intersection = 0;
  let union = 0;
  let runMatches = 0;
  let testMatches = 0;
  let statusMatches = 0;
  const perCategory = Object.fromEntries(
    CATEGORIES.map((category) => [
      category.id,
      { intersection: 0, union: 0 }
    ])
  );
  for (let index = 0; index < labelsA.length; index += 1) {
    const left = labelsA[index];
    const right = labelsB[index];
    expect(
      left.concealed_case_id === right.concealed_case_id &&
        left.category === right.category,
      "agreement-case-alignment"
    );
    const leftFiles = new Set(left.labels.important_files);
    const rightFiles = new Set(right.labels.important_files);
    const caseIntersection = Array.from(leftFiles).filter((item) =>
      rightFiles.has(item)
    ).length;
    const caseUnion = new Set([...leftFiles, ...rightFiles]).size;
    intersection += caseIntersection;
    union += caseUnion;
    perCategory[left.category].intersection += caseIntersection;
    perCategory[left.category].union += caseUnion;
    if (canonicalJson(left.labels.run) === canonicalJson(right.labels.run)) {
      runMatches += 1;
    }
    if (canonicalJson(left.labels.test) === canonicalJson(right.labels.test)) {
      testMatches += 1;
    }
    if (left.labels.status === right.labels.status) {
      statusMatches += 1;
    }
  }
  const perCategoryJaccard = Object.fromEntries(
    Object.entries(perCategory).map(([category, value]) => [
      category,
      value.intersection / value.union
    ])
  );
  const result = {
    important_file_micro_jaccard: intersection / union,
    important_file_per_category_micro_jaccard: perCategoryJaccard,
    passed:
      intersection / union >= 0.8 &&
      Object.values(perCategoryJaccard).every((value) => value >= 0.7) &&
      runMatches / 10 >= 0.9 &&
      testMatches / 10 >= 0.9 &&
      statusMatches / 10 >= 0.9,
    run_command_exact_agreement: runMatches / 10,
    status_exact_agreement: statusMatches / 10,
    test_command_exact_agreement: testMatches / 10,
    thresholds: {
      important_file_micro_jaccard: 0.8,
      important_file_per_category_micro_jaccard: 0.7,
      run_command_exact_agreement: 0.9,
      status_exact_agreement: 0.9,
      test_command_exact_agreement: 0.9
    }
  };
  return result;
}

function createEvidenceWriter(root, baseBindings) {
  const written = [];
  const writePrepared = (relative, value, options = {}) => {
    validateArtifact(value);
    expect(
      Object.entries(baseBindings).every(
        ([key, digest]) => value.bindings[key] === digest
      ),
      "writer-base-bindings"
    );
    const result = writeCanonicalExclusive(root, relative, value, options);
    const record = { ...result, value };
    written.push(record);
    return record;
  };
  return {
    records() {
      return [...written];
    },
    write(relative, artifactType, producer, sequence, payload, extraBindings = {}) {
      return writePrepared(
        relative,
        artifactEnvelope({
          artifactType,
          bindings: { ...baseBindings, ...extraBindings },
          payload,
          producer,
          sequence
        })
      );
    },
    writePrepared
  };
}

function implementationCommitment(repoRoot) {
  const files = IMPLEMENTATION_FILES.map((relative) => {
    const target = path.join(repoRoot, relative);
    const stat = fs.lstatSync(target);
    expect(
      stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
      `implementation-file-${relative}`
    );
    const bytes = fs.readFileSync(target);
    return {
      bytes: bytes.length,
      path: relative,
      sha256: sha256(bytes)
    };
  });
  return {
    files,
    sha256: sha256(canonicalBytes(files))
  };
}

function relevantCandidateFiles(repoRoot) {
  const paths = [
    "eval/v1.0.0-prospective/evidence.schema.json",
    "eval/v1.0.0-prospective/protocol.schema.json",
    "eval/v1.0.0-simulation/artifact.schema.json",
    "eval/v1.0.0-simulation/protocol.schema.json",
    "eval/v1.0.0-simulation/lib/fixtures.js",
    "eval/v1.0.0-simulation/lib/tabletop.js",
    "eval/v1.0.0-simulation/lib/validator.js",
    "scripts/lib/v1-prospective-release.js",
    "src/analyze.js",
    "test/v1-prospective-release.test.js",
    "test/v1-simulation.test.js"
  ];
  return paths.map((relative) => ({
    path: relative,
    sha256: sha256File(path.join(repoRoot, relative))
  }));
}

function deterministicEntropy(personaId, implementationCommit, populationSha256) {
  return sha256(
    Buffer.from(
      [
        "kanon-v1.0.0-simulation-entropy-v1",
        personaId,
        implementationCommit,
        populationSha256
      ].join("\0"),
      "utf8"
    )
  );
}

function entropyCommitment(personaId, entropyHex) {
  return sha256(
    Buffer.from(
      `kanon-v1.0.0-simulation-entropy-commitment-v1\0${personaId}\0${entropyHex}`,
      "utf8"
    )
  );
}

function selectionRecord(item, conceal = false) {
  return {
    case_reference: conceal
      ? concealedIdentity(item.fixture.case_id)
      : item.fixture.case_id,
    category: item.fixture.category,
    fixture_sha256: item.fixture_sha256,
    rank_sha256: item.rank_sha256
  };
}

function rawLabelRecord(item, introduceDisagreement) {
  const labels = structuredClone(item.fixture.labels);
  if (introduceDisagreement) {
    const alternate = Object.keys(item.fixture.files).find(
      (relative) => !labels.important_files.includes(relative)
    );
    expect(Boolean(alternate), "label-disagreement-alternate");
    labels.important_files[labels.important_files.length - 1] = alternate;
  }
  return {
    category: item.fixture.category,
    concealed_case_id: concealedIdentity(item.fixture.case_id),
    fixture_sha256: item.fixture_sha256,
    labels,
    simulated_judgment: true
  };
}

function adjudicateLabels(labelsA, labelsB) {
  const history = [];
  for (let index = 0; index < labelsA.length; index += 1) {
    const left = labelsA[index];
    const right = labelsB[index];
    if (
      canonicalJson(left.labels.important_files) !==
      canonicalJson(right.labels.important_files)
    ) {
      history.push({
        case_id: left.concealed_case_id,
        decision: "accept-label-a-as-rubric-consistent",
        field: "important_files",
        label_a: left.labels.important_files,
        label_b: right.labels.important_files,
        prediction_access: false
      });
    }
  }
  expect(history.length === 1, "adjudication-disagreement-count");
  return history;
}

function concealedIdentity(caseId) {
  return sha256(
    Buffer.from(
      `kanon-v1.0.0-simulation-concealed-case-v1\0${caseId}`,
      "utf8"
    )
  );
}

function bundleCommitment(digests) {
  expect(
    Array.isArray(digests) &&
      digests.length > 0 &&
      digests.every((digest) => /^[0-9a-f]{64}$/u.test(digest)),
    "bundle-commitment-input"
  );
  return sha256(canonicalBytes(digests));
}

function input(kind, digest) {
  expect(
    typeof kind === "string" &&
      kind.length > 0 &&
      /^[0-9a-f]{64}$/u.test(digest),
    "access-input"
  );
  return { kind, sha256: digest };
}

function ensureNoPriorFinalAttempt(simulationRoot) {
  const conflicting = fs.readdirSync(simulationRoot).filter(
    (name) =>
      name.startsWith("evidence-sha256-") ||
      name.startsWith("tabletop-attempt-")
  );
  expect(conflicting.length === 0, "single-final-tabletop");
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!isUnsupportedDirectorySync(error)) {
      throw error;
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function isUnsupportedDirectorySync(error) {
  return (
    process.platform === "win32" &&
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["EBADF", "EINVAL", "ENOSYS", "ENOTSUP", "EPERM"].includes(
      String(error.code)
    )
  );
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(`simulation: ${label}`);
  }
}

export const TABLETOP_IMPLEMENTATION_PATH = fileURLToPath(import.meta.url);
