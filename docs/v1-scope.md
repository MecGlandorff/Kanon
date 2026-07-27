# Kanon v1 scope and compatibility freeze

**Status:** Slice 1 scope freeze. This file records the v1 boundary; it does
not claim that a v1 runtime, plugin artifact, or Guard implementation exists.

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
| `$kanon:status` | Report version, deprecation, Guard, receipt, and diagnostic status. |
| `$kanon:steer` | Keep a small evidence-backed work state for one verified slice at a time. |
| `$kanon:aswitch` | Prepare a consented handoff with a manual fallback. |

The stable promises remain context before covered mutation where Guard is
proven, continuity without invented memory, epistemic honesty, and no hidden
execution. They do not promise that a model understood evidence, that a
declared command is safe or succeeds, or that Kanon replaces host sandboxing,
approvals, or human review.

Codex CLI and Claude Code CLI are the two stable skill-host candidates. The
six-skill surface is a target contract for both hosts; it is not evidence of a
released dual-host artifact yet. Other Codex and Claude surfaces need their
own installed-artifact coverage before they receive a stable-surface claim.

### Guard boundary

This scope freeze deliberately selects no Guard mode for either host. A host
may receive a `guard` claim only after its own feasibility spike directly
proves denial for the covered calls. Until that proof and the user decision
required by the design are present, this document makes neither a `guard` nor a
`notice` runtime claim. A result from one host is never evidence for the
other.

## Compatibility map

The v0.4 workflows remain compatibility aliases or explicit continuity
operations exactly as frozen by the v1 design. This table is a target mapping,
not a claim that the aliases are already implemented in the current v0.4
artifact.

| v0.4 workflow | v1 destination | Compatibility constraint |
| --- | --- | --- |
| `brief` | `$kanon:orient` | Preserve bounded orientation and receipt-oriented evidence. |
| narrow `ask` | `$kanon:orient` or `$kanon:verify` | Keep the query surface narrow; this freeze does not create unrestricted repository questions. |
| `resume` | `$kanon:resume` | Live evidence continues to win over stored state. |
| `refresh` | Explicit continuity write | Remains an explicit bounded write, not an implicit read-workflow side effect. |
| `todo` | Explicit continuity note | Remains a human-owned, bounded continuity operation. |
| `verify` | `$kanon:verify` | Continue to distinguish contradiction from non-observation. |

The `ask` routing discriminator is intentionally not invented here: the
authoritative map permits `orient` or `verify`, while its exact v1 command
grammar belongs to a later implementation slice.

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

## Evidence status at this freeze

### Known

- `V_1design.md` is the frozen v1 contract on `release/v.1.0.0`.
- The current package metadata and generated skill describe the existing
  `0.4.0-rc.1` surface, not a v1 implementation.
- The current public v0.4 wrappers are `ask`, `brief`, `refresh`, `resume`,
  `todo`, and `verify`; the v1 names are not yet shipped.

### Likely

- The existing containment, sanitization, non-execution, artifact, and
  cross-platform conformance machinery can be reused by later v1 slices.
  Reuse still needs slice-specific validation.

### Unknown

- Whether Codex CLI can reliably deny covered shell and patch calls through a
  trusted, enabled plugin hook.
- Whether Claude Code can reliably deny covered shell and patch calls through
  a trusted, enabled plugin hook.
- The host-specific receipt, session, compaction, and plugin-data behavior
  required for a production Guard design.
- The release-governance participants, beta-adapter opt-in policy, first
  adapter directions, and full-history shipment decision listed in the v1
  design.

### Stale / suspicious

- No direct contradiction was observed between this freeze and the reviewed
  v0.4 release materials. Those materials are historical/current-v0.4
  evidence, not proof of v1 behavior.

### Suggested

- Complete the isolated, host-specific Guard spikes before choosing a Guard
  runtime mode or building receipts.
- Do not begin the dual-manifest production plugin skeleton, type ratchet,
  deprecation checker, continuity integration, or any later v1 slice while
  this three-slice run is active.
