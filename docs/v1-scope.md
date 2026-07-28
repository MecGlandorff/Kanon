# Kanon v1 scope and compatibility freeze

**Status:** Frozen scope plus the authorized 2026-07-28 lifecycle-notice and
receipt-only amendments, additive Run B recovery status through product
slice 8, and accepted Run C status through slice 13. Slices 12 and 13 are
honest capability deferrals, not implementation claims. This file is not a
release claim. Run C hard-stops before slice 14.

**Authority:** [`V_1design.md`](../V_1design.md) is the authoritative contract,
including its explicitly authorized 2026-07-28 amendment. This companion
records the reduced scope. Where this file is less specific than the design,
the design controls.

## Stable v1 contract

The following six skills are the entire stable v1 skill surface:

| Stable skill | Frozen contract boundary |
| --- | --- |
| `$kanon:orient` | Bounded task-relevant repository evidence and a context receipt. |
| `$kanon:resume` | Compare prior continuity state with live repository evidence. |
| `$kanon:verify` | Verify documentation, state, receipt, and validation claims. |
| `$kanon:status` | Report version, deprecation, notice/enforcement, hook observability, receipt, and diagnostic status. |
| `$kanon:steer` | Keep a small evidence-backed work state for one verified slice at a time. |
| `$kanon:aswitch` | Prepare a consented handoff with a manual fallback. |

The stable promises are advisory context readiness and receipt-state notice
through explicit skill and status output, continuity without invented memory,
epistemic honesty, and no hidden execution. Stable v1 classifies context and
available receipt data as Current, Stale, or Unknown; it does not
automatically intercept host operations or enforce mutation blocking on either
supported host.
The promises do not say that a model understood evidence, that a declared
command is safe or succeeds, or that Kanon replaces host sandboxing, approvals,
or human review.

Codex CLI and Claude Code CLI have the two validated stable host adapters.
Run B slice 8 implements the four read skills `orient`, `resume`, `verify`,
and `status` equivalently for both adapters. Run C slices 10 and 11 add
equivalent `steer` and `aswitch` surfaces. Other Codex and Claude surfaces need
their own installed-artifact coverage before they receive a stable-surface
claim.

### Guard boundary

The initial scope freeze deliberately selected no Guard mode for either host.
The additive Run B decision below supersedes that open question with
independent notice-only decisions. A future host may receive a `guard` claim
only after a separate feasibility spike directly proves denial for its covered
calls. A result from one host is never evidence for the other.

### Run B notice-mode decision

**Decision date:** 2026-07-27.

This additive decision resolves the runtime-mode question left open by the
slice 1 freeze. The user explicitly accepts the independent Codex CLI and
Claude Code hard-Guard no-go decisions recorded by Runs A, A.1, and A.2.

| Stable host | v1 mode | Enforcement |
| --- | --- | --- |
| Codex CLI | `notice` | `false` |
| Claude Code CLI | `notice` | `false` |

Notice is advisory and observational. It must not deny, rewrite, suppress, or
auto-approve a host operation; force repository reading; block mutation; or
imply that repository context was understood. Unsupported, disabled,
untrusted, or otherwise unobservable hook state remains `Unknown`.

Hard Guard remains future experimental work outside the public v1 capability
contract. The six-skill stable target and dual-host support are unchanged.
Runs A, A.1, and A.2 remain historical evidence for their named host surfaces;
this product decision does not rewrite their reports, promote non-observation
to a negative capability conclusion, or turn either no-go into proof that
enforcement is impossible.

### Run B recovery lifecycle-notice amendment

**Decision date:** 2026-07-28.

The user authorized a narrow amendment after principal review reopened the
slice-4 production-hook boundary. Lifecycle-hook declarations are now
host-specific and optional. Stable v1 ships no automatic lifecycle notice for
Codex CLI or Claude Code because no safe executable, argument-vector, and
environment boundary is directly proven for every claimed platform.

Stable notice is delivered only through explicit skill and status output.
Both hosts remain in `notice` mode with `enforcement: false`. The shipped
artifact contains no production `PreToolUse` hook, shared hook manifest,
shell command, or PATH-dependent lifecycle launcher. The absence of Kanon's
lifecycle notice is reported as unavailable; missing host hook introspection
remains `Unknown`.

This amendment does not reinterpret any historical Guard observation, relax
the hostile-environment boundary, add a platform-specific hook, implement
Guard or receipt persistence, or transfer evidence between hosts or
platforms. Automatic lifecycle notice and hard Guard remain future,
host-specific experimental work.

### Run C receipt-only amendment

**Decision date:** 2026-07-28.

The user authorizes slice 9 only as a bounded, non-enforcing receipt
subsystem. Receipts may persist only in hardened plugin data outside the
inspected repository and may be evaluated only during explicit Kanon
invocations. They are local continuity evidence, never security credentials,
authorization tokens, mutation permissions, or proof that repository context
was understood.

Explicit `orient` may issue or replace a receipt. Explicit `status` and
`verify` may inspect it. A directly observed root, task, or evidence mismatch
may be `Stale`; unavailable session, compaction, lifecycle, or host evidence
remains `Unknown`. Recovery is an explicit `orient` refresh. If safe plugin
data is unavailable, Kanon keeps the returned in-memory result or reports
`Unknown`; it never falls back to repository files or undocumented host state.

This amendment supersedes only the Run B receipt-persistence exclusion. It
does not revise either hard-Guard no-go, authorize automatic notice or hooks,
relax the hostile-environment boundary, or permit blocking, approval, denial,
rewrite, interception, emergency bypass, or evidence transfer between hosts
or platforms.

### Run C slice 9 implementation status

The accepted receipt engine uses `kanon-context-receipt-v2` and a fixed
`kanon-context-receipt-store-v1`. Explicit `orient` may replace at most one
bounded hash-only receipt for the active root in validated plugin data;
`status` and `verify` may read it only during explicit invocations, and
`resume` remains read-only. The store is capped at 16 KiB, eight unique roots,
and 30 days. Invalid regular state is recoverable only through explicit
`orient`; linked state fails closed.

The deterministic engine and both host adapter code paths are Known.
Documented, safe plugin-data availability and complete session, compaction,
lifecycle, and host observations on current wrapper invocations remain
`Unknown`. Without those inputs, the receipt is returned in memory and cannot
be classified `Current`. This limitation is not evidence that either host
cannot expose the inputs in another documented surface.

The implementation and validation record is
[`v1-run-c.md`](v1-run-c.md). Slice 9 itself did not expose `steer` or
`aswitch`, add a hook, or implement a later-slice capability.

### Run C slice 10 implementation status

The accepted `steer` skill uses one 32 KiB exact-schema request supplied on
standard input. Its deterministic state covers the desired outcome,
completion criteria, constraints, caller-asserted user decisions, caller
evidence references, Unknowns, exactly one next slice, required verification,
and stop or redirect reasons. The fixed loop is Understand, choose one slice,
act, verify, and reassess.

Every caller value remains explicitly untrusted. Caller evidence references
remain `Unknown`, a next phase is only `Suggested`, any stop or redirect
reason pauses the state, and the model always reports `authorization: false`
and `completion: NotClaimed`. Steer reuses the shared live-authoritative
continuity engine, performs no plan action or verification, executes no
repository code, manages no agent, writes no state, and creates no competing
project-memory subsystem.

Both host adapters and installed skill wrappers expose the same state model.
This slice did not implement `aswitch`, terminal launch, or full-history
behavior.

### Run C slice 11 implementation status

The accepted `aswitch` skill is a deterministic preview, write, and receive
state machine, not a process manager. It asks for a missing target and offers
exactly Last plan, Compacted structured handoff, and experimental Full-history
archive. Last plan is the default and is recommended when a validated
caller-supplied steer plan is available; compacted is recommended otherwise.
Full-history remains `Unknown` and unavailable pending the separate slice 13
source and acknowledgement gate.

Preview binds one bounded payload, provenance, trust classification, source
coverage, omissions, target, canonical repository identity, and canonical
external destination to a SHA-256. Write requires a matching
`kanon-aswitch-approval-v1` caller assertion of explicit user approval.
Missing or mismatching approval writes nothing. A successful write creates
only a content-derived `kanon-agent-handoff-v1` JSON file in the approved
external directory, never inside the inspected repository. Each destination
is capped at eight Kanon handoffs and 256 inspected entries.

Receiving validation checks the exact schema, semantic checksum,
content-derived filename, canonical repository root, recorded commit,
complete normalized Git change-set fingerprint, and target host. A directly
observed mismatch is `Stale`; an unavailable comparison remains `Unknown`;
only complete matching observations are `Current`. The checksum is integrity
evidence, not an authenticity signature. Payload claims remain untrusted and
the proposed next step remains `Suggested`.

No executable is resolved or launched in slice 11. The manual fallback is a
structured `Suggested` command model whose executable resolution is
`Unknown`; its argument contains only a fixed bootstrap plus the safe handoff
path, never raw handoff content. The transfer deletes no source history, stops
no source agent, claims no repository ownership, and grants no authorization
or enforcement.

### Run C slice 12 proof-gate status

No beta terminal-launch adapter ships. A 2026-07-28 bounded read-only
diagnostic directly observed macOS arm64, an `Apple_Terminal` parent-process
label, trusted absolute repository-external resolution of Codex CLI `0.145.0`
and Claude Code `2.1.219`, and successful no-model `--version` calls. Temporary
scratch state was removed.

Those facts do not establish an automatic-launch capability. The terminal
label is not a proven automation API, executable discovery is not a terminal
argument boundary, and a version call does not prove target startup, approval
presentation, or handoff acceptance. No live launch was separately authorized.
The first source-to-target tuple and beta opt-in policy also remain undecided.

Codex-to-Claude and Claude-to-Codex on the observed macOS/Apple Terminal
surface therefore remain independently `Unknown` and deferred. Every other
operating system and terminal surface remains `Unknown`. The stable manual
fallback is unchanged, and the artifact contains no terminal-launch module,
manifest claim, automatic process path, ownership, or supervision behavior.

### Run C slice 13 feasibility-gate status

Full-history archive remains experimental and unavailable. The user supplied
no transcript or archive path and no source-specific risk acknowledgement.
Official Claude Code documentation describes an interactive
`/export [filename]`, but no export was invoked or supplied. Official Codex
app-server documentation describes a history read API, but no app-server
connection, history read, or exported archive was supplied. Documentation is
design input, not an archive or installed-host runtime proof.

Bounded local help checks on the trusted Codex CLI `0.145.0` and Claude Code
`2.1.219` executables made no model call and retained only sanitized booleans.
Codex top-level help mentioned app-server; neither top-level help mentioned
export. The missing term remains non-observation and creates no negative host
conclusion.

The stable `aswitch` surface visibly returns `ModeUnavailable`, `Unknown`
availability, and an experimental label for Full-history. It creates no
preview or file and accepts no archive content. No host state was read,
translated, or enumerated. A future qualifying archive must remain a separate
untrusted attachment, require a separate risk acknowledgement, and never be
merged into the compacted handoff, bootstrap instruction, or process
arguments.

## Compatibility map

The v0.4 workflows remain compatibility aliases or explicit continuity
operations exactly as frozen by the v1 design. Run B slice 8 implements these
routes without restoring removed public capabilities.

| v0.4 workflow | v1 destination | Compatibility constraint |
| --- | --- | --- |
| `brief` | `$kanon:orient` | Preserve bounded orientation and receipt-oriented evidence. |
| narrow `ask` | `$kanon:orient` or `$kanon:verify` | Keep the query surface narrow; this freeze does not create unrestricted repository questions. |
| `resume` | `$kanon:resume` | Live evidence continues to win over stored state. |
| `refresh` | Explicit continuity write | Remains an explicit bounded write, not an implicit read-workflow side effect. |
| `todo` | Explicit continuity note | Remains a human-owned, bounded continuity operation. |
| `verify` | `$kanon:verify` | Continue to distinguish contradiction from non-observation. |

Narrow `ask` accepts exactly one purpose, run, test, Git-state,
documentation-drift, or literal-search family. Documentation drift routes to
`verify`; the other five route to `orient`. Mixed and unsupported questions
are rejected as too broad.

## Experimental, beta, and excluded work

| Boundary | Frozen disposition |
| --- | --- |
| Full-history archive | Experimental and risky. It is unavailable without a user-provided transcript or documented host export; it remains a separate untrusted archive. |
| Incremental-value claim | Experimental evaluation work. No claim that Kanon improves Codex is allowed until the separate paired, blinded, sealed holdout is complete. |
| Scorecards, refactor advice, dead-code advice, numeric health scores, and ready-to-paste agent prompts | Outside the public v1 contract. Existing v0.4 experimental source remains unshipped unless it clears a separate trust and evaluation path. |
| Automatic terminal launch adapters | Beta only. Each adapter must be labeled by source agent, target agent, operating system, and terminal surface; a manual fallback is mandatory. |
| Ownership leases, process supervision, crash recovery, and agent orchestration | Explicitly out of scope. |

Any beta launch adapter must preview its resolved executable, working directory,
handoff path, and sanitized arguments; require explicit approval; keep raw
repository content out of arguments; validate and contain handoff paths; and
fail safely to the manual handoff.

## Evidence status through Run C slice 13

### Known

- `V_1design.md`, including the authorized 2026-07-28 amendment, is the
  authoritative v1 contract on `release/v.1.0.0`.
- The embedded development-artifact version remains `0.4.0-rc.1`; this branch
  is implementation evidence, not a v1 release.
- The generated plugin exposes all six stable skills: `orient`, `resume`,
  `status`, `verify`, `steer`, and `aswitch`, plus the root `kanon` skill.
- The compatibility wrappers remain `ask`, `brief`, `refresh`, `resume`,
  `todo`, and `verify`; read aliases route to the stable slice 8 runtime,
  while `refresh` and `todo` retain their explicit bounded v0.4 writes.
- The stable artifact has separate Codex and Claude manifests but no
  production lifecycle-hook declaration. Advisory notice is present only in
  explicit skill and status output.
- The slice 8 receipt contains only a versioned schema, `enforcement: false`,
  and SHA-256 bindings for root, task, evidence, and an available host session.
  It has no persistence or lifecycle behavior.
- Slice 9 supersedes that internal receipt schema with a bounded v2 advisory
  receipt and conditional plugin-data storage. Persistence and evaluation
  occur only on explicit Kanon invocations, and the receipt has no
  authorization or enforcement effect.
- Slice 10 exposes one read-only, non-authorizing steer state through
  equivalent Codex and Claude adapters and reuses the shared continuity
  engine without adding persistence or orchestration.
- Slice 11 exposes one bounded consent-driven handoff state machine through
  equivalent Codex and Claude adapters. It implements no automatic launch,
  ownership, supervision, or raw-history access.
- Slice 12 ships no beta launch adapter. Installed-artifact conformance proves
  the launch surface is absent while the stable manual fallback remains.
- Slice 13 creates no history archive and ships no transcript parser or host
  state reader. Full-history remains visibly experimental and unavailable.

### Likely

- The existing containment, sanitization, non-execution, artifact, and
  cross-platform conformance machinery can be reused by later v1 slices.
  Reuse still needs slice-specific validation.

### Unknown

- Unavailable host hook introspection remains `Unknown`; this is distinct from
  the Known absence of a shipped Kanon lifecycle-notice hook.
- Safe plugin-data availability and complete session, compaction, lifecycle,
  and host observations on the current Codex and Claude wrapper surfaces
  remain unproven. This keeps actual host persistence and `Current`
  classification `Unknown`.
- The release-governance participants, beta-adapter opt-in policy, first
  adapter directions, and full-history shipment decision listed in the v1
  design.
- Windows ACL privacy equivalence for a user-selected handoff destination is
  unavailable to the portable runtime and remains `Unknown`.
- Both launch directions on the observed macOS/Apple Terminal parent surface,
  and all other operating-system/terminal tuples, remain `Unknown` because no
  safe terminal automation and argument contract received direct proof.
- Codex and Claude full-history sources remain independently `Unknown` because
  no qualifying archive was supplied or produced. Current documentation is not
  installed-runtime or archive evidence.

### Stale / suspicious

- Slice 1 statements that the four read-skill directories did not yet exist
  are superseded by the additive slice 8 implementation record.
- Pre-recovery Run B claims that the shared production hook had no open P1 are
  superseded by the 2026-07-28 amendment and recovery certification.
- Run B's prohibition on receipt persistence is superseded only by the
  receipt-only amendment above; its Guard, hook, and enforcement exclusions
  remain current.
- Slice 8 statements that the receipt is always in-memory are superseded only
  by slice 9's bounded, conditional plugin-data persistence.
- Statements above or in the Run B record that `steer` or `aswitch` are absent
  are superseded by Run C slices 10 and 11.
- Any inference that installed CLIs or `TERM_PROGRAM` prove a beta launch
  adapter is suspicious and rejected.
- Earlier Run C status text that slice 13 was unimplemented is superseded only
  by its explicit experimental/unavailable feasibility result; it is not a
  full-history implementation.

### Suggested

- Keep automatic lifecycle notice, hard Guard, and any enforcing or
  hook-driven receipt lifecycle outside public v1 until separately proven and
  authorized.
- Hard-stop Run C before slice 14. A later run may reconsider full-history only
  with a qualifying source and separate source-specific risk acknowledgement.
