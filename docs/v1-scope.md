# Kanon v1 scope and compatibility freeze

**Status:** Frozen scope plus additive Run B implementation status through
product slice 8. This file is not a release claim and does not authorize
slice 9, Guard, `steer`, or `aswitch`.

**Authority:** [`V_1design.md`](../V_1design.md) is the frozen authoritative
contract. This companion records its reduced scope without changing it. Where
this file is less specific than the design, the design controls.

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

The stable promises are advisory context readiness and receipt-state notice,
continuity without invented memory, epistemic honesty, and no hidden
execution. Stable v1 classifies context and available receipt data as Current,
Stale, or Unknown; it does not enforce mutation blocking on either supported
host.
The promises do not say that a model understood evidence, that a declared
command is safe or succeeds, or that Kanon replaces host sandboxing, approvals,
or human review.

Codex CLI and Claude Code CLI have the two validated stable host adapters.
Run B slice 8 implements the four read skills `orient`, `resume`, `verify`,
and `status` equivalently for both adapters. The remaining frozen skills,
`steer` and `aswitch`, are not exposed. Other Codex and Claude surfaces need
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

## Evidence status through Run B slice 8

### Known

- `V_1design.md` is the frozen v1 contract on `release/v.1.0.0`.
- The embedded development-artifact version remains `0.4.0-rc.1`; this branch
  is implementation evidence, not a v1 release.
- The generated plugin exposes `kanon`, `orient`, `resume`, `status`, and
  `verify`. `steer` and `aswitch` are absent.
- The compatibility wrappers remain `ask`, `brief`, `refresh`, `resume`,
  `todo`, and `verify`; read aliases route to the stable slice 8 runtime,
  while `refresh` and `todo` retain their explicit bounded v0.4 writes.
- The slice 8 receipt contains only a versioned schema, `enforcement: false`,
  and SHA-256 bindings for root, task, evidence, and an available host session.
  It has no persistence or lifecycle behavior.

### Likely

- The existing containment, sanitization, non-execution, artifact, and
  cross-platform conformance machinery can be reused by later v1 slices.
  Reuse still needs slice-specific validation.

### Unknown

- Unavailable host and hook introspection remains `Unknown`.
- Host session, compaction, and plugin-data behavior needed by any future
  experimental hard-Guard design remains unproven.
- The release-governance participants, beta-adapter opt-in policy, first
  adapter directions, and full-history shipment decision listed in the v1
  design.

### Stale / suspicious

- Slice 1 statements that the four read-skill directories did not yet exist
  are superseded by the additive slice 8 implementation record.

### Suggested

- Keep hard Guard and any broader receipt lifecycle outside public v1.
- Before Run C, require a clean slice 8 commit and an explicit sequencing
  decision about skipping or reframing the now-out-of-scope product slice 9.
