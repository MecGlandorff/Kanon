# Six-person governance simulation

Status: proposed development-only tabletop exercise.

This document defines a simulation of the six distinct human participants
required by the frozen Kanon v1.0.0 prospective release-evidence protocol. It
does not amend, activate, satisfy, or weaken that protocol.

The simulation may test process ordering, access boundaries, schemas,
commitments, failure handling, and role-specific instructions. It cannot
create human independence, independent labels, unseen holdout evidence, an
official score, `release-supported`, release readiness, or release authority.

## Mandatory classification

Every simulation artifact must contain these exact semantic declarations:

```json
{
  "evidence_classification": "simulated-development-only",
  "human_independence": false,
  "prospective_protocol_activated": false,
  "release_authority": false,
  "simulation": true
}
```

Omission or contradiction of any declaration invalidates the simulation
artifact. No simulation result may be copied into the prospective release
namespace as human evidence.

## Relationship to the frozen protocol

The normative prospective protocol remains
`eval/v1.0.0-prospective/PROTOCOL.json`. Its real-human requirements and all
29 release gates remain unchanged. In particular:

- six simulated personas are not six real humans;
- session separation is not human independence;
- prompt isolation is not blindness proof;
- an agent-generated label is not an independent human label;
- a pseudo-holdout is not an unseen release holdout;
- a simulated release-owner decision cannot authorize release.

The simulation must use a distinct `eval/v1.0.0-simulation/` namespace.
Historical evidence and `eval/v1.0.0-prospective/` are read-only inputs.

## Simulated roles

| Persona | Simulated responsibility | Procedural access boundary | Required output |
| --- | --- | --- | --- |
| SIM-CO | Candidate owner | Sees protocol, development fixtures, candidate source, and public validation; does not see pseudo-holdout identities or labels before simulated freeze | Candidate-freeze proposal and conflict declaration |
| SIM-CE | Holdout custodian and evaluation executor | Controls synthetic metadata, concealed pseudo-identities, ordering, attempt receipt, and evaluator inputs | Custody, selection, freeze, and execution records |
| SIM-LA | Labeler A | Sees the frozen rubric and assigned synthetic case material; does not see candidate predictions, traces, hypotheses, or Labeler B output | Immutable raw judgment set A |
| SIM-LB | Labeler B | Has the same input boundary as SIM-LA and does not see Labeler A output | Immutable raw judgment set B |
| SIM-ADJ | Disagreement adjudicator | Sees the rubric and both frozen raw judgment sets; does not see product predictions or traces | Agreement calculation, adjudication history, and final simulated labels |
| SIM-RO | Release decision owner | Sees commitments and finalized simulation evidence only after simulated unblinding | Mechanical gate assessment and simulation conclusion |

All personas are controlled by the same user and agent system. The access
boundaries are process-rehearsal constraints, not evidence of actual
separation.

## Permitted simulation modes

### Synthetic tabletop

This is the default and recommended mode. It uses generated metadata, fixture
repositories, fixture labels, and fixture predictions. It may use a reduced
balanced inventory, such as two development and two pseudo-holdout cases per
category, because it tests workflow mechanics rather than statistical claims.

Synthetic tabletop inputs must not imitate a specific uninspected repository
closely enough to create accidental corpus evidence.

### Real-repository development rehearsal

This requires separate explicit authorization. Every repository identity or
content exposed during such a rehearsal immediately becomes
development-visible and permanently ineligible for a future unseen holdout,
including related forks, mirrors, shared-history projects, template
derivatives, and material duplicates.

Real-repository rehearsal remains simulated development evidence even when it
uses the full 200-case shape. It cannot satisfy human governance or release
gates.

## Required ordering

The simulation must enforce this sequence:

1. Bind the frozen prospective protocol and this simulation specification.
2. Create role records with the mandatory simulation classification.
3. Freeze the synthetic population, contamination registry, and selection
   procedure.
4. Commit simulated custodian and release-owner entropy before population
   ordering.
5. Select development fixtures and concealed pseudo-holdout fixtures.
6. Freeze the labeling rubric before either labeler begins.
7. Produce raw judgments A and B without cross-access.
8. Calculate agreement and adjudicate before predictions are exposed.
9. Freeze final simulated labels.
10. Freeze the unchanged baseline candidate and its exact artifact.
11. Durably consume one pseudo-holdout attempt immediately before its first
    fixture is processed.
12. Finalize comparison evidence and reveal predictions.
13. Apply simulation gates mechanically without editing prior artifacts.
14. Produce exactly one permitted conclusion.

An ordering violation produces `simulation-invalid`; it must not be repaired
by rewriting an earlier artifact.

## Permitted conclusions

The simulation may produce exactly one of:

- `simulation-complete`: the rehearsal followed its frozen procedure and all
  simulation mechanics passed;
- `simulation-failed`: complete simulated evidence shows a simulation gate
  failed;
- `simulation-inconclusive`: required simulation evidence is missing or
  cannot be finalized;
- `simulation-invalid`: ordering, mutation, classification, or containment
  made the rehearsal unusable.

It must never produce `release-supported`, `release-not-supported`, an
official score, or a human release decision.

## Artifact rules

Simulation artifacts must be:

- additive and content-addressed;
- canonically serialized where JSON is used;
- bound to exact source, protocol, specification, fixture, and tool hashes;
- explicit about which persona produced each record;
- explicit that persona identity is simulated;
- immutable after the next role consumes them;
- contained beneath `eval/v1.0.0-simulation/`;
- excluded from the production package;
- absent from historical and prospective evidence namespaces.

The simulation should retain an access ledger recording which persona was
given which input commitment and when. This ledger demonstrates procedural
ordering only; it does not demonstrate real blindness.

## Prohibited actions and claims

The simulation must not:

- modify the frozen prospective protocol or its schemas;
- create or attest real-human identities;
- claim independent, blinded, causal, or release evidence;
- select a real holdout without separate authorization;
- run a real corpus during a synthetic tabletop;
- use network or live-model calls unless separately authorized;
- modify product behavior, ranking, thresholds, labels, policy, or package
  version;
- publish, push, tag, or release;
- erase or reinterpret historical failures;
- conceal that all personas share a controlling user and agent system.

## Tabletop completion criteria

A successful synthetic tabletop requires:

- all six persona records and access boundaries;
- a balanced synthetic development and pseudo-holdout inventory;
- two non-collaborating simulated raw label sets;
- deterministic agreement and adjudication;
- candidate and label freeze ordering;
- exactly one durable pseudo-attempt receipt;
- canonical finalization and immutable failure controls;
- exact trace-on/off behavior for fixtures when applicable;
- deterministic simulation evidence;
- unchanged production artifact;
- a conclusion limited to `simulation-complete`;
- an explicit list of gaps that still require real humans and unseen data.

Completion proves only that the process can be rehearsed mechanically. It does
not reduce any prospective release P0/P1/P2 blocker.

## Next permissible action

After this specification is reviewed, the next action may be a separately
authorized synthetic tabletop implementation using bounded fixtures. It must
hard-stop before real-repository selection, product modification, versioning,
publication, or release.
