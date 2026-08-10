# Kanon v1 Run C implementation record

**Status:** Run C is complete through product slice 13 on
`release/v.1.0.0`. Slices 12 and 13 are honest capability deferrals, not
implementation claims. This is not a release claim. Run C hard-stops before
slice 14.

The authoritative contract is [`V_1design.md`](../V_1design.md), including
the user-authorized 2026-07-28 receipt-only amendment. Historical Guard
evidence remains immutable. Both stable hosts remain in explicit-only notice
mode with `enforcement: false`, and no production lifecycle hook ships.

## Run preconditions and amendment

The session header was confirmed as `gpt-5.6-sol` with `max` reasoning before
work. The branch was exactly `release/v.1.0.0`, HEAD was exactly
`ad18f685ba0f2967d046db929667634710cccc0a`, and the worktree was clean.

The receipt-only amendment was committed separately as
`0c7ba450bf8ec668ea9cafd20b79601058b8831a`. Focused contract tests passed
6 of 6, and `git diff --check` passed. The amendment permits only bounded
advisory receipt continuity in hardened plugin data outside the repository,
evaluated during explicit Kanon invocations. It adds no Guard, hook,
interception, approval, denial, rewrite, automatic execution, or bypass.

## Slice 9 — receipt-only lifecycle

### Accepted behavior

- `kanon-context-receipt-v2` stores only fixed provenance, an issuance time,
  `enforcement: false`, and SHA-256 root, task, evidence, and optional
  aggregate host-evidence bindings.
- `orient` returns an in-memory receipt and, only when a documented adapter
  supplies a validated external plugin-data root, atomically creates or
  replaces the corresponding persisted receipt. It never writes the
  inspected repository.
- `status` and `verify` may read the fixed receipt store during an explicit
  invocation. Explicit receipt input takes precedence and remains untrusted
  until schema validation. `resume` remains read-only and does not update
  plugin data.
- The store is `kanon-context-receipt-store-v1`, capped at 16 KiB, eight
  unique repository-root records, and 30 days. It contains no repository
  excerpts, commands, branch subjects, prompts, secrets, or imperative
  instructions.
- Direct root, task, or evidence contradiction is `Stale`. Complete matching
  root, task, evidence, session, compaction, lifecycle, and host observations
  are `Known` and `Current`. Missing or mismatching host lifecycle evidence,
  incomplete evidence, invalid data, or expired data remains `Unknown`.
- Invalid regular receipt state is replaced only by explicit `orient`, and
  the recovery is reported. Linked or multiply-linked state fails closed.
  If safe persistence is unavailable, the returned receipt remains in memory
  and persistence is `Unknown`; there is no repository or undocumented
  host-state fallback.

### Hardened boundary and correction loop

Receipt storage and the exact-version deprecation cache share one checked
plugin-data primitive. It canonicalizes the repository and storage roots,
rejects root overlap, leaf and intermediate symlink or reparse resolution,
non-user-owned or group/world-writable storage directories on POSIX,
non-files, multiply-linked files, invalid UTF-8, oversized data, and unsafe
filenames. Reads use a bounded no-follow descriptor with identity checks.
Writes use a private exclusive temporary file, file synchronization, atomic
same-directory replacement, and best-effort directory synchronization.

The principal-engineer review corrected the P1 candidates before acceptance:
duplicate persistence boundaries were unified; group-writable storage was
rejected; successful plugin-data mutation became visible as
`read_only: false` while `repository_read_only` stays true; ambiguous control
and bidi characters were rejected from opaque host identifiers; hostile
comparison objects now return `Unknown` instead of throwing; missing files
are distinguished from invalid files without assuming a plain Error
prototype; and silent malformed-state replacement became an explicit
recovery result. No P0 or P1 remains for this slice.

### Validation evidence

- Focused receipt, deprecation, plugin, scope, stable-skill, adversarial, and
  type-contract tests: 54 passed, 0 failed, 0 skipped.
- Strict checked JavaScript: all canonical `src/v1` JavaScript modules in the
  promised project passed with zero diagnostics.
- Generated synchronization: 103 artifacts synchronized and the subsequent
  synchronization check passed.
- Full `npm run validate`: 193 tests, 191 passed, 2 platform proofs skipped,
  0 failed.
- Manifest validation: Claude Code 2.1.219 strict validation passed; the
  bundled Codex plugin validator passed under the installed Python
  3.9/PyYAML 6.0.1 environment. Codex CLI 0.145.0 exposes no native plugin
  validation command, so native Codex validation remains `Unknown`.
- Pre-commit installed-artifact conformance: 34 of 34 checks passed. The
  packed artifact contained 120 allowlisted entries, no runtime dependency,
  no production lifecycle hook, no Guard spike, and both receipt modules.
  Its SHA-256 was
  `d1349349d102fd9499cf918dbd666f408b928c97bb48d8edecb9de8e3f62ba93`.
- JavaScript syntax, JSON parsing, package allowlisting, generated/runtime
  equivalence, and `git diff --check` passed.

### Residual classification

- **Known:** the deterministic engine, validated adapter context, and
  installed artifact implement the bounded receipt-only contract for both
  adapter code paths.
- **Likely:** documented hosts that eventually expose an equivalent safe
  plugin-data root and complete lifecycle observations can use the same
  engine without a second persistence subsystem; this is not host proof.
- **Unknown:** the current Codex and Claude wrapper surfaces do not directly
  prove or supply safe plugin-data roots plus complete session, compaction,
  lifecycle, and host evidence. Actual host persistence and `Current`
  classification therefore remain `Unknown`; ordinary wrapper invocations
  return an in-memory receipt.
- **Stale / suspicious:** slice 8 statements that receipts are always
  in-memory are superseded only by this bounded conditional persistence.
  Guard, hook, and enforcement exclusions remain current.
- **Suggested:** keep host-specific plugin-data or lifecycle wiring out of the
  public claim until its documented boundary is independently proven.

Same-user concurrent replacement between directory validation and rename,
Windows ACL privacy equivalence, and Windows replacement semantics remain
platform residuals. They fail to `Unknown` where observable and do not create
an authorization effect.

## Slice 10 — thin steer

### Accepted behavior

- Both host adapters expose stable `steer` through the shared
  `kanon-stable-skill-result-v1` envelope and exact-version deprecation check.
- `kanon-steer-request-v1` is an exact-schema, 32 KiB input supplied on
  standard input. The shipped wrappers never place raw steer state in process
  arguments.
- `kanon-steer-state-v1` covers the desired outcome, completion criteria,
  constraints, caller-asserted user decisions, caller evidence references,
  Unknowns, exactly one next slice, required verification, and stop or
  redirect reasons.
- The fixed phases are Understand, choose one slice, act, verify, and reassess.
  A phase transition is only `Suggested`; a stop or redirect reason makes the
  suggestion `Unknown` and pauses the state.
- Caller values remain `caller-untrusted`, caller evidence references remain
  `Unknown`, `authorization` is always false, and completion is always
  `NotClaimed`.
- Steer runs the existing bounded, live-authoritative continuity engine. It
  does not execute a plan step, repository code, or verification; expand
  scope; manage agents; write state; or create a second project-memory
  subsystem.

### Correction loop and validation evidence

The principal review removed a hostile-object serialization path, moved the
32 KiB check after exact runtime validation over a canonical primitive-only
shape, bounded the derived repository-inspection task to 2 KiB, changed user
decision provenance from direct to caller-asserted, and changed phase
advancement into a `Suggested` or `Unknown` value. Regression tests prove that
a hostile `toJSON` function is not invoked.

- Focused steer, stable-skill, adversarial, plugin, type, wrapper, and scope
  tests: 72 tests, 71 passed, 1 PowerShell availability check skipped,
  0 failed.
- Strict checked JavaScript passed with zero diagnostics; generated
  synchronization produced 107 artifacts and the subsequent check passed.
- Full `npm run validate`: 198 tests, 196 passed, 2 platform proofs skipped,
  0 failed.
- Both plugin validators, JavaScript syntax, JSON parsing, package allowlist,
  and `git diff --check` passed. The pre-commit package contained 125
  allowlisted entries; installed-artifact conformance passed 36 of 36 checks
  with artifact SHA-256
  `64fbd3cc9c6c4ee3fb354c8a1dc7555510b403e6231a8492f965d603735e076c`.

### Residual classification

- **Known:** the pure state model, live continuity integration, CLI stdin
  boundary, both adapters, and both generated wrapper families implement the
  bounded non-orchestrating contract.
- **Likely:** an agent following the skill contract can use the suggested loop
  without another memory system; this is a workflow expectation, not proof of
  agent behavior.
- **Unknown:** caller assertions, evidence references, actual execution,
  verification success, semantic slice smallness, and completion remain
  unproven by the state model.
- **Stale / suspicious:** Run B and slice 9 statements that `steer` is absent
  are superseded. Their statements that `aswitch` is absent remain current.
- **Suggested:** use steer output only as bounded planning state and directly
  verify work before any completion claim.

No P0 or P1 remains for slice 10.

## Slice 11 — consent-driven aswitch handoff

### Accepted behavior

- Both host adapters expose `aswitch` through the shared stable envelope and
  exact-version deprecation check.
- `kanon-aswitch-request-v1` is a bounded 64 KiB standard-input request with
  exactly one preview, write, or receive operation. Raw handoff content never
  enters process arguments.
- A missing target produces an explicit target-selection state. The skill
  always offers exactly Last plan, Compacted structured handoff, and
  Full-history archive. Last plan is the default; compacted becomes
  recommended when no validated caller-supplied steer plan is available.
  Full-history remains experimental and unavailable in this slice.
- `kanon-aswitch-preview-v1` displays the selected payload, provenance, trust,
  source coverage, omissions, destination, and suggested next action. Its
  SHA-256 binds the canonical plan and destination.
- A write occurs only when a `kanon-aswitch-approval-v1` caller assertion of
  explicit approval exactly matches the preview. The approval is never
  treated as host proof or execution authorization.
- `kanon-agent-handoff-v1` is capped at 64 KiB and written atomically only to a
  content-derived filename in an existing canonical, user-selected external
  directory. Each destination is capped at eight Kanon handoffs and 256
  inspected entries. The repository remains byte-for-byte read-only.
- Last-plan carries only the bounded steer state plus essential repository
  identity. Compacted handoff separates goal, caller-asserted decisions,
  constraints, live-work claim, evidence claims, directly observed changed
  paths, validation claims, Unknowns, remaining plan, and a Suggested next
  step. Free text remains `caller-untrusted`.
- Receive validates schema, semantic SHA-256, content-derived filename,
  canonical root, recorded commit, complete normalized change-set
  fingerprint, and target host. Complete matches are `Current`; a known
  mismatch is `Stale`; unavailable evidence is `Unknown`.
- No process is launched. The manual fallback is a structured `Suggested`
  command model with executable resolution `Unknown`; its one argument
  contains only Kanon's fixed bootstrap and the safe handoff path.

### Correction loop and validation evidence

The principal review added a transferred-steer-state validator, rebound every
preview before envelope creation, rejected hostile nested plan access, made
Unknown changed-file sets empty, capped per-destination file and enumeration
resources, and removed an overclaim that Windows ACL privacy was Known.
Linked, overlapping, noncanonical, over-capacity, malformed, oversized, and
approval-mismatched destinations fail closed without a repository write.

- Focused aswitch, stable-skill, adversarial, plugin, type, wrapper, and scope
  tests: 75 tests, 74 passed, 1 PowerShell availability check skipped,
  0 failed.
- Strict checked JavaScript passed with zero diagnostics; generated
  synchronization produced 112 artifacts and the subsequent check passed.
- Full `npm run validate`: 205 tests, 203 passed, 2 platform proofs skipped,
  0 failed.
- Both plugin validators, JavaScript syntax, JSON parsing, package allowlist,
  installed-artifact conformance, and `git diff --check` passed. The
  pre-commit package contained 131 allowlisted entries; installed-artifact
  conformance passed 38 of 38 checks with artifact SHA-256
  `312be2497783068b131d1b29e0f6570018b02822b523bccc641d969a4f58fe57`.

### Residual classification

- **Known:** both adapter paths implement identical bounded request schemas,
  preview/write consent gates, manual fallback structure, and receiving
  comparisons. The exact installed artifact exercises the stable wrapper.
- **Likely:** a host agent following the skill contract can show the preview
  and obtain actual user consent; runtime evidence proves only the bounded
  caller assertion, not the human interaction.
- **Unknown:** manual executable resolution and host acceptance are untested;
  Windows ACL privacy equivalence is unavailable; a missing latest plan is not
  evidence that none exists; and incomplete Git state prevents `Current`.
- **Stale / suspicious:** earlier Run C statements that `aswitch` is absent
  are superseded. A known receiving mismatch is explicitly Stale.
- **Suggested:** use the manual command only after user review, and refresh the
  handoff or obtain explicit approval before continuing from Stale or Unknown.

Same-user replacement between destination validation and atomic rename remains
a residual race where portable descriptor-relative traversal is unavailable.
The checksum detects change, not authorship. No P0 or P1 remains for slice 11.

## Slice 12 — beta terminal-launch proof gate

### Accepted result: deferred

No beta terminal-launch adapter ships. The stable `aswitch` manual fallback
remains available and does not depend on terminal automation.

A bounded read-only diagnostic on 2026-07-28 reused the hardened Guard-spike
executable resolver and minimum environment. It directly observed:

- `darwin` on `arm64`;
- the sanitized parent-process label `TERM_PROGRAM=Apple_Terminal`;
- trusted absolute executable resolution outside the repository for Codex CLI
  `0.145.0` and Claude Code `2.1.219`; and
- successful bounded `--version` calls with no model turn.

The temporary diagnostic scratch directory was removed. It created no
repository state, did not inspect host session internals, and performed no
terminal launch.

These observations do not prove a launch adapter. A parent-process terminal
label is not a documented automation surface, a resolved host executable does
not prove a safe terminal argument boundary, and a version response does not
prove destination startup, approval presentation, or handoff acceptance. No
live launch was separately authorized for this slice, and the frozen design's
source-to-target priority and beta opt-in decisions remain `Unknown`.

| Source | Target | Platform hint | Result |
| --- | --- | --- | --- |
| Codex CLI | Claude Code | macOS arm64 / Apple Terminal parent label | `Unknown` — deferred |
| Claude Code | Codex CLI | macOS arm64 / Apple Terminal parent label | `Unknown` — deferred |

Every other operating system and terminal surface remains independently
`Unknown`. No result transfers between directions, hosts, systems, or terminal
surfaces.

### Correction loop and validation evidence

Principal review rejected three wishful inferences: installed binaries are not
launch proof, `TERM_PROGRAM` is not an executable/argument contract, and a
manual handoff approval is not approval to start an external process. Adding
an unproven adapter would have expanded the attack surface and public claim
without direct runtime evidence, so the production artifact, manifests, and
capability metadata remain unchanged.

- Focused scope and no-adapter contract tests passed.
- Strict checked JavaScript and generated synchronization remained unchanged
  and passed.
- The full validation, both manifest validators, package allowlist,
  installed-artifact conformance, syntax and JSON checks, and
  `git diff --check` passed.
- Installed-artifact conformance continues to prove that terminal-launch
  surfaces are absent and the manual `aswitch` wrapper remains functional.

No P0 or P1 remains for slice 12. A beta adapter requires a separately selected
source/target/OS/terminal tuple, a directly testable safe launch contract, and
fresh explicit approval before any live launch.

## Slice 13 — full-history feasibility gate

### Accepted result: experimental and unavailable

No qualifying history archive was available during Run C:

- The user supplied no transcript, archive path, provenance record, or
  source-specific risk acknowledgement.
- Current official Claude Code documentation describes `/export [filename]`
  as a plain-text export of the current conversation. No Claude export was
  invoked or supplied in this run.
- Current official Codex app-server documentation describes `thread/read`
  with `includeTurns` as a documented conversation-history read API. It is
  not an archive supplied to this run, and no app-server connection or history
  read was attempted.
- Bounded local `--help` observations for the trusted Codex CLI `0.145.0` and
  Claude Code `2.1.219` executables both exited successfully without a model
  call. Codex top-level help mentioned `app-server`; neither top-level help
  output mentioned `export`. That absence is non-observation, not proof that a
  host lacks an interactive export.

Only sanitized booleans from the local help checks were retained, and their
temporary scratch state was removed. Kanon did not read, parse, translate,
copy, or enumerate Codex or Claude user-state files.

The shipped `aswitch` result therefore keeps Full-history archive visibly
`experimental`, with availability `Unknown` and stage `ModeUnavailable`.
Selecting it produces no preview, handoff, archive, process launch, or
repository/plugin-data mutation. Extra archive-like request fields fail the
exact request schema and their contents are not reflected in output.

Any future qualifying archive must be a separate untrusted attachment. It
requires a separate source-specific risk acknowledgement and must never be
merged into the compacted handoff, injected into the fixed bootstrap
instruction, placed in process arguments, or treated as imperative
instructions. A checksum would establish integrity only, not authorship or
trust.

### Independent host result

| Source host | Documented design input | Run C source | Result |
| --- | --- | --- | --- |
| Codex CLI | App-server history read API | No supplied or produced archive | `Unknown` / unavailable |
| Claude Code | Interactive `/export [filename]` | No supplied or produced export | `Unknown` / unavailable |

Documentation does not prove installed runtime behavior, and one host's
contract is no evidence for the other.

### Correction loop and validation evidence

Principal review rejected using documentation as the missing archive, parsing
known transcript storage, treating top-level help non-observation as absence,
or exporting a session without the separate risk acknowledgement. The result
adds no parser, transcript reader, archive writer, host-state path, bootstrap
injection, or public capability claim.

- Focused full-history, scope, public-skill, plugin, and aswitch tests:
  43 tests, 42 passed, 1 PowerShell availability check skipped, 0 failed.
- Strict checked JavaScript passed with zero diagnostics. The canonical
  generator synchronized 112 artifacts and the subsequent check passed.
- Full `npm run validate`: 208 tests, 206 passed, 2 platform proofs skipped,
  0 failed.
- Both manifest validators, package allowlisting, JavaScript syntax, JSON
  parsing, and `git diff --check` passed.
- Focused runtime coverage proves that a full-history request fails safely as
  `ModeUnavailable`. The exact installed artifact retains the manual handoff
  and contains no terminal-launch or full-history runtime module. It contains
  131 allowlisted files; conformance passed 38 of 38 checks with SHA-256
  `6d719fb08ce6204310024dbcabb9341dd5738051f69bf4711bdc939484aab980`.

No P0 or P1 remains for slice 13. Full-history stays experimental and
unavailable until a later, separately authorized run receives a qualifying
source and risk acknowledgement. Run C stops here before slice 14.
