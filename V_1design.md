# Kanon v1.0 Design

- Status: revised design proposal
- Target: `1.0.0`
- Branch: `release/v.1.0.0`

## Decision

Kanon v1 is an evidence-backed control layer for coding agents.

It helps an agent:

1. load task-relevant repository evidence before changing code;
2. resume work from live repository state instead of invented memory;
3. steer complex work through small verified slices;
4. verify claims without turning non-observation into certainty; and
5. prepare consented handoffs between coding agents.

The project targets `1.0.0` directly. It will not publish intermediate
`0.5.x`, `0.6.x`, or `0.7.x` feature releases. Internal alpha, beta, and RC
artifacts are allowed while the stable contract is being proven.

Repeated coding-agent review is development feedback, not independent
validation. Stable publication remains bound to the release evidence and
governance requirements below.

## Product promise

> Kanon gives coding agents the smallest relevant body of repository evidence
> before action and keeps later claims tied to observable state.

The stable promises are:

- **Advisory context readiness** — explicit Kanon skill and status output
  surfaces context readiness and available receipt state without intercepting
  or blocking host operations.
- **Continuity without invented memory** — live repository evidence wins over
  stored state and conflicts remain visible.
- **Epistemic honesty** — direct evidence, inference, non-observation,
  contradiction, and suggestion remain distinct.
- **No hidden execution** — orientation and continuity do not execute
  repository-controlled code.

Kanon does not claim that a model understood evidence merely because the
evidence entered its context. It does not prove a declared command is safe or
successful. It does not replace the host sandbox, approvals, or human review.

## Authorized lifecycle-notice amendment

**Decision date:** 2026-07-28.

This amendment changes only the automatic lifecycle-notice boundary. It
supersedes the earlier mandatory shared-hook wording in **Plugin and host
shape**, the lifecycle portion of **Stable host contract**, and any stable
exit-criterion reading that assumes a production notice hook must ship.

Lifecycle-hook declarations are host-specific and optional. Stable v1 ships
no automatic lifecycle notice for Codex CLI or Claude Code because no safe
cross-platform executable, argument-vector, and environment boundary has been
directly proven for either stable host contract. Stable notice is delivered
only through explicit skill and status output. It remains advisory, with
`enforcement: false`; it never intercepts, denies, rewrites, approves,
suppresses, or forces repository reading.

The amendment preserves the hostile-environment boundary. Codex CLI 0.145.0
accepts a command string and launches it through an inherited shell with
`-lc`, so an inner launcher cannot neutralize shell selection or startup
processing that occurs first. Claude Code's direct-exec form avoids a shell,
but a bare executable still depends on inherited `PATH`, and no portable
absolute Node.js executable or equivalent cross-platform boundary is proven.
A host result never transfers to another host or platform.

Affected production clauses now require:

- no shared or host-specific production lifecycle-hook declaration in the
  stable v1 artifact;
- `notice` plus `enforcement: false` in both host capability records;
- lifecycle-notice availability reported as unavailable, while unsupported
  host hook introspection remains `Unknown`; and
- any future automatic lifecycle notice or hard Guard to remain separately
  proven, host-specific experimental work.

Non-goals are a hostile-environment relaxation, a replacement shell or
launcher, platform-specific stable hooks, Guard, Guard-coupled receipt
persistence, mutation interception, or any claim that explicit notice proves
reading or understanding.

## Authorized receipt-only amendment

**Decision date:** 2026-07-28.

This amendment changes only the receipt boundary. It supersedes the
receipt-persistence non-goal in the lifecycle-notice amendment, the
Guard-feasibility wording that coupled every production receipt to proven
hooks, and product slice 9 only to the extent necessary to permit a bounded
advisory receipt subsystem.

Stable v1 may persist versioned receipts only in hardened plugin data outside
the inspected repository and may evaluate them only during an explicit Kanon
invocation. A receipt is local continuity evidence, not a security credential
or authorization token. It never blocks, approves, authorizes, intercepts,
denies, rewrites, or permits mutation. No hook, automatic execution,
enforcement path, or emergency bypass is authorized.

Known matching root, task, evidence, and available host observations may
classify a receipt as `Current`. A directly observed root, task, or evidence
mismatch may classify it as `Stale`. Unavailable session, compaction,
lifecycle, or host evidence remains `Unknown`; it never becomes a negative or
safety conclusion. Recovery is an explicit `orient` refresh.

Receipt storage must be minimal, bounded, versioned, runtime-validated,
no-follow, and atomic where the platform exposes those primitives. It stores
hashes, bounded identifiers, timestamps, and provenance rather than repository
prose, commands, branch subjects, prompts, secrets, or imperative
instructions. If a safe plugin-data root is unavailable, Kanon returns the
in-memory receipt or `Unknown` and never falls back to repository files or
undocumented host state. Same-user concurrent replacement remains a disclosed
filesystem residual rather than an enforcement claim.

This amendment does not revise either host's hard-Guard no-go, add automatic
lifecycle notice, transfer evidence between hosts or platforms, weaken the
hostile-environment boundary, or authorize any Guard mode.

## Scope

### Stable v1 core

| Skill | Contract |
| --- | --- |
| `$kanon:orient` | Load bounded task-relevant evidence and issue a context receipt |
| `$kanon:resume` | Compare prior continuity state with live repository evidence |
| `$kanon:verify` | Verify documentation, state, receipt, and validation claims |
| `$kanon:status` | Report version, deprecation, Guard, and diagnostic status |
| `$kanon:steer` | Maintain a small evidence-backed work state for complex tasks |
| `$kanon:aswitch` | Prepare a consented handoff to another coding agent |

The v0.4 workflows remain compatibility aliases:

| v0.4 | v1 |
| --- | --- |
| `brief` | `orient` |
| narrow `ask` | `orient` or `verify` |
| `resume` | `resume` |
| `refresh` | explicit continuity write |
| `todo` | explicit continuity note |
| `verify` | `verify` |

Experimental scorecards, refactor advice, dead-code advice, numeric health
scores, and ready-to-paste agent prompts remain outside the public contract.

### Capability boundaries

The `$kanon:aswitch` handoff workflow is stable. It always has a manual
fallback and does not depend on terminal automation.

Full-history transfer is experimental. It is unavailable unless the user
provides a transcript or the host exposes one through a documented export
interface. Kanon never parses undocumented Codex or Claude session storage.

Automatic terminal launch is an optional adapter capability. An adapter may
ship as beta only when it is labeled by source agent, target agent, operating
system, and terminal surface. Missing adapter coverage does not block stable
`1.0.0`.

Beta adapters still must satisfy containment, sanitization, approval, type,
artifact, and fail-safe tests. Kanon does not add ownership leases, process
supervision, crash recovery, or an agent-orchestration framework.

## Plugin and host shape

Kanon v1 supports both Codex CLI and Claude Code as stable skill hosts. One
released plugin root contains separate host manifests, shared concise skills,
and one runtime. Lifecycle-hook declarations are optional and host-specific;
the stable v1 artifact contains none:

```text
kanon/
├── .codex-plugin/
│   └── plugin.json
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── orient/
│   ├── resume/
│   ├── verify/
│   ├── status/
│   ├── steer/
│   └── aswitch/
└── runtime/
    ├── core/
    ├── adapters/
    │   ├── codex/
    │   ├── claude/
    │   └── terminal/
    └── package.json
```

The `.codex-plugin` manifest configures Codex only. The `.claude-plugin`
manifest configures Claude Code only. Both hosts discover root-level
`skills/`; host-specific event input and output are normalized by the
corresponding runtime adapter.

Do not use a shared lifecycle-hook declaration. A future host-specific
experimental declaration may exist only after its executable,
argument-vector, environment, host version, operating system, and tool surface
are independently proven. Include a local runtime `package.json` declaring
`"type": "module"` so a copied or installed artifact does not depend on an
ancestor package boundary.

Keep every `SKILL.md` concise. Put deterministic behavior in runtime code and
load detailed policy references only when needed.

The one npm tarball is the release artifact and contains this exact dual-host
root. Artifact conformance installs that tarball once, then loads and exercises
the same root through both Codex CLI and Claude Code. A host-specific manifest
or adapter is never treated as proof for the other host.

### Stable host contract

| Host surface | Stable skills | Stable v1 runtime contract |
| --- | --- | --- |
| Codex CLI | All six v1 skills | Explicit skill/status `notice`; enforcement false; no lifecycle hook |
| Claude Code CLI | All six v1 skills | Explicit skill/status `notice`; enforcement false; no lifecycle hook |
| Other Codex or Claude surfaces | Only when installed-artifact tests cover them | No automatic notice or enforcement claim without separate host-and-platform proof |

Host invocation syntax may differ, but skill behavior, schemas, trust labels,
and failure semantics remain equivalent. Dual-host skill support is part of
stable `1.0.0`; hard Guard support is claimed per tested host surface.

## Stable skill contracts

### Orient

`$kanon:orient` must:

- canonicalize the repository root;
- read applicable repository instructions first;
- inspect Git without mutation or repository-controlled execution;
- choose a small task-relevant evidence set;
- preserve exclusions, timeouts, unreadable paths, and scan limits;
- sanitize and delimit repository-derived values; and
- issue a receipt bound to the session, task, root, and evidence fingerprint.

It must not dump the repository merely to appear thorough.

### Resume

`$kanon:resume` incorporates the repo-continuity workflow into Kanon's shared
continuity engine.

It compares:

- repository instructions;
- current Git state and recent commits;
- high-signal documentation;
- recent artifacts;
- prior `.kanon` state; and
- the last checkpoint or handoff.

Live evidence wins over stored state. Added, changed, contradicted, and Unknown
claims remain separate. Read-only resume does not write the repository.
`refresh` and `todo` remain explicit bounded write operations.

### Verify

`$kanon:verify` checks:

- direct documentation contradictions;
- context-receipt freshness;
- continuity and handoff integrity;
- generated-artifact synchronization; and
- declared versus actually executed validation.

A command is not described as successful unless its result was directly
observed. Incomplete evidence prevents absence conclusions.

### Status

`$kanon:status` reports:

- installed Kanon and plugin versions;
- exact-version npm deprecation status;
- Guard mode and, where observable, hook availability;
- context-receipt status; and
- bounded diagnostics.

Unavailable host introspection remains Unknown. Status does not execute or
modify repository code.

### Steer

`$kanon:steer` is intentionally thin. It is a skill contract plus a small
deterministic state model, not a new orchestration framework.

It maintains:

- outcome and completion criteria;
- constraints and user-owned decisions;
- relevant evidence and Unknowns;
- the next small work slice;
- required verification; and
- reasons to stop or redirect.

Its loop is:

```text
Understand → choose one slice → act → verify → reassess
```

Steer pauses for product, architecture, trust-boundary, destructive, or
external-effect decisions. It does not make trivial edits ceremonial.

### Agent switch

`$kanon:aswitch` is a handoff selector, not a process manager.

When invoked, it asks for the target agent if the user did not name one, then
offers exactly three payload modes:

1. **Last plan only (default)** — the most recent explicit `steer` plan or
   continuity checkpoint. It preserves the recorded task, decisions, remaining
   work, and validations without synthesizing unavailable history. If no plan
   exists, the option is unavailable and compacted handoff becomes the
   recommended choice.
2. **Compacted handoff** — a bounded agent-written summary in a versioned
   schema. It minimizes free text and separates the goal, decisions,
   constraints, repository identity, live work state, evidence references,
   changed files, completed validation, Unknowns, current plan, and suggested
   next step. Every field records provenance and trust; repository-derived
   material cannot become an imperative field.
3. **Full-history archive (experimental and risky)** — a user-supplied
   transcript or visible session history obtained through a documented host
   export. It is marked partial or unavailable when coverage cannot be proven.
   Kanon never reads undocumented `~/.codex` or `~/.claude` internals, claims
   access to hidden reasoning, or reconstructs missing turns. The bounded
   archive requires a separate acknowledgement that it may contain secrets,
   tool output, and file content.

The flow is:

```text
choose target → choose payload → preview coverage and destination
→ approve → write handoff → launch supported adapter or show manual command
```

The transfer copies context; it does not delete source history, stop the source
agent, or claim exclusive repository ownership. Each handoff records its mode,
source coverage, omissions, truncation, provenance, repository identity, and
schema version. Repository-derived fields remain explicitly untrusted.

Before acting, the receiving skill:

1. validates the schema version and bounded field types;
2. verifies the handoff's SHA-256 integrity checksum;
3. canonicalizes and compares the active repository root;
4. compares the recorded Git commit when both observations are Known; and
5. compares a bounded normalized Git change-set fingerprint when both status
   observations are complete.

The checksum detects accidental or unexpected content change; it is not an
authenticity signature. A mismatch is `Stale`, an unavailable comparison is
`Unknown`, and neither silently becomes current. The target must refresh the
handoff or obtain explicit approval before continuing from mismatched state.
This is context validation, not repository ownership or process locking.

Raw handoff content never appears in a shell argument. The target receives a
path to a bounded handoff envelope plus a fixed bootstrap instruction. A
full-history archive is stored separately, referenced as untrusted material,
and not injected into the target's initial prompt.

Compacted summaries and full-history archives can still carry mistaken or
injected content. The target treats summary fields as claims, treats the next
step as a suggestion, and revalidates live state. Kanon does not claim that a
target reading either payload cannot be influenced by it.

The user sees the target, payload mode, coverage, destination, and resolved
launch request before approval. If automatic launch is unsupported or fails,
the handoff remains valid and Kanon returns the manual start instruction.

## Guard feasibility gate

Guard mode is the flagship technical risk. Prove it before implementing the
receipt subsystem.

### Spike

Build a minimal disposable plugin/hook probe that tests:

- plugin hook discovery and trust;
- `PreToolUse` behavior for shell and patch tools;
- the exact supported deny or rewrite schema;
- `session_id`, `turn_id`, `cwd`, and plugin-data availability;
- behavior after resume and compaction;
- disabled and untrusted hooks; and
- the claimed host surface.

Official documentation is design input, not runtime proof.

### Stable surface

Codex CLI and Claude Code CLI are separate initial hard-Guard candidates. Run
the spike independently on each host. A passing result on one host is no
evidence for the other.

Desktop, IDE, web, and other surfaces receive a Guard claim only if the same
installed-artifact integration tests prove their denial behavior. Otherwise
they receive no automatic lifecycle or enforcement claim. Explicit skill and
status output may expose advisory `notice` only where the installed artifact
is covered.

### Decision

After the spike:

- if covered calls can be reliably denied, implement receipts and `guard`;
- if they cannot, expose `notice` and revise the stable product promise before
  further Guard work.

Do not build Guard-coupled or enforcement receipts against assumed hook
semantics. The authorized 2026-07-28 receipt-only amendment permits only the
separate advisory subsystem defined above.

The 2026-07-28 amendment records the completed stable-v1 branch of this
decision: both initial hosts remain hard-Guard no-go, stable notice is explicit
skill/status output only, and no production lifecycle hook ships.

### Advisory receipt-only behavior

For the stable non-enforcing surface:

1. Explicit `orient` may issue or replace a bounded receipt.
2. Explicit `status` and `verify` may inspect it.
3. `resume` remains read-only unless a separate public contract expressly
   authorizes a plugin-data update.
4. Directly observed root, task, or evidence mismatches may be `Stale`.
5. Missing session, compaction, lifecycle, or host evidence remains
   `Unknown`.
6. Recovery is an explicit `orient` refresh.
7. Safe plugin data is the only persistence location; otherwise the result is
   in-memory or `Unknown`.

This behavior is continuity evidence only and has no mutation or authorization
effect.

### Guard receipt behavior

For a proven Guard surface:

1. A new task marks the previous receipt stale.
2. Read-only inspection remains available.
3. Orient loads relevant evidence and issues a receipt.
4. The pre-tool hook checks the receipt before covered mutation.
5. Normal host sandbox and approval handling still applies.
6. Missing or stale receipts produce a precise recovery instruction.
7. Root, session, task, or compaction changes invalidate the receipt.

Receipt state lives in plugin data, not the inspected repository.

Guard modes are:

- `guard` — require a receipt for proven covered tools;
- `notice` — warn without claiming enforcement;
- `off` — explicit opt-out; and
- `managed` — administrator-enforced behavior where supported.

A one-turn emergency bypass is explicit, visible, time-bounded, and recorded
in plugin data. A broken guard must not permanently strand a user.

Some hosted or specialized tools may bypass local hooks. Claim only the
surfaces and tools tested. Guard is defense in depth, not a sandbox.

## Version and deprecation check

Every stable skill invocation consults one shared exact-version status checker.

The checker:

- uses embedded build metadata, never repository input;
- queries only the fixed HTTPS npm registry origin and exact package version;
- does not invoke `npm`, a shell, repository `.npmrc`, or user registry config;
- uses a short timeout, response-size cap, and same-origin redirect limit;
- validates and sanitizes the response;
- caches only in plugin data;
- fails open when offline; and
- never blocks repository analysis solely because status is Unknown.

Each invocation consults the checker. Cache entries are keyed to the active
host session and expire after one hour or at session end, whichever comes
first. Within that bound, a deprecated result remains sticky until a
successful later check proves otherwise.

When deprecated, output begins with the installed version, sanitized
deprecation reason, replacement information as data, and a reminder that
upgrade is a separate user-approved action.

The npm package already exists, so a live smoke test can compare a deprecated
historical version with the active release. Deterministic and CI tests use a
mock transport; registry availability is not a correctness dependency.

## Trust invariants

The v0.4 trust-repair requirements remain baseline:

- repository content, paths, Git metadata, state, TODOs, handoffs, registry
  text, and commands are untrusted data;
- read workflows do not execute repository-controlled code;
- canonical containment applies to every read and write;
- Git remains non-executing, bounded, non-interactive, and non-mutating;
- failed, incomplete, excluded, or unreadable evidence remains Unknown;
- command execution requires definition review and user approval;
- network activity is fixed-origin, bounded, disclosed, and never controlled
  by the inspected repository;
- every degraded mode and bypass is visible; and
- the evaluated artifact is the released artifact.

No new subsystem may weaken these invariants.

## Lightweight code and type strategy

Keep executable ESM JavaScript. Do not add a TypeScript transpilation step.

Preserve zero runtime dependencies unless a reviewed requirement cannot be met
safely with Node built-ins. Pinned development-only tooling may be added when
excluded from the release artifact.

Use strict checked JSDoc as a ratchet:

1. Add pinned `typescript` and Node types as development dependencies.
2. Configure `tsc --noEmit` with `allowJs`, `checkJs`, strict null checks,
   unchecked-index protection, and unknown catch variables.
3. Type every new or touched v1 module immediately.
4. Migrate existing trust and I/O boundaries first.
5. Expand by subsystem without blocking early vertical slices on a big-bang
   retrofit.
6. Require all stable shipped runtime modules to pass before candidate freeze.
7. Exclude experimental, unshipped source from the stable type claim.

Use `unknown` at external boundaries and narrow through runtime validators.
Avoid `any` except at an isolated documented compatibility boundary. Prefer
discriminated result unions over sentinel strings or ambiguous `null`.

High-value boundaries are:

- path, Git, and subprocess results;
- config and persisted state;
- plugin and hook payloads;
- context receipts;
- registry responses;
- render models; and
- handoff and launch-adapter requests.

Static types do not validate hostile runtime data. Runtime schemas remain
mandatory.

Keep code auditable:

- small pure functions;
- narrow I/O boundaries;
- explicit state transitions;
- one hardened primitive per cross-cutting concern;
- no internal framework or dependency-injection container;
- no abstraction without a concrete user journey or failure mode; and
- delete unnecessary code found during review.

Concise means low accidental complexity, not compressed code.

## Test strategy

Continue using `node:test`. Reuse the existing release, artifact, corpus, and
three-OS conformance machinery.

Every implementation slice includes:

- the normal path;
- its explicit failure path;
- runtime-schema tests for changed boundaries;
- strict type checking for changed typed code; and
- the relevant adversarial regression.

Apply broader layers only where they prove a real invariant:

- pure unit tests for receipts, sanitization, state, and ranking;
- contract tests for plugin layout, skill metadata, hook payloads, schemas, and
  compatibility aliases;
- lifecycle integration tests for each claimed Guard host surface;
- adversarial tests for containment, injection, controls, budgets, timeouts,
  registry values, handoff modes, receiving-side staleness, and launch
  requests;
- installed-artifact tests on the release matrix; and
- behavioral evaluation separate from deterministic correctness.

Seeded generated cases may exercise parsers and state machines. Mutation
testing is optional and targeted only where it finds weak trust or gate tests;
it is not a blanket release requirement.

The paired Codex ablation is required before claiming Kanon improves Codex. If
that experiment is incomplete, stable v1 may ship only with an explicit
no-incremental-value-claim statement.

## Principal-engineer correction loop

Apply this loop to every vertical slice.

### 1. Frame

Record the user outcome, changed invariant, trust boundary, non-goals, failure
modes, and evidence required for completion.

### 2. Implement

Build the smallest complete behavior with validation, failure handling,
rendering, and tests. Avoid speculative parallel layers.

### 3. Verify

Run targeted tests, relevant adversarial tests, strict checking for touched
typed boundaries, artifact checks when applicable, and `git diff --check`.

### 4. Challenge

Review the raw diff and evidence in a fresh context:

> Is there anything a principal AI systems engineer would reject because it
> relies on an unstated assumption, weak trust boundary, misleading claim,
> correlated evaluation, unsafe failure mode, portability gap, unbounded
> resource use, hidden external effect, or unnecessary abstraction?

Explicitly ask whether:

- hostile data affects control flow or instructions;
- failure becomes false certainty;
- lifecycle or concurrency breaks the conclusion;
- tests can pass while the invariant is broken;
- the host actually supports the claimed behavior;
- a smaller design is easier to audit;
- recovery and bypass are visible;
- network or state surprises the user; and
- source, tested artifact, and published artifact remain identical.

### 5. Correct and close

Fix every P0/P1 before starting another feature. Record lower-risk residuals
with an owner and release disposition. Close only when behavior and failure
paths are tested, types and validators agree, artifacts match, and the diff is
clearer after review.

Fresh model sessions and neutral prompts help find mistakes but remain
correlated development evidence. Do not label them independent review.

## Updated implementation plan

Each numbered item is an internal implementation slice, not a public version.
Steps marked parallel do not wait for product implementation.

### Parallel critical path: release governance

Before candidate freeze:

1. recruit a labeler who is not the implementation author;
2. recruit a distinct independent reviewer;
3. assign owners and availability dates;
4. freeze the release policy before repository selection; and
5. keep labels outside every inspected checkout.

Under the current release contract, a disclosed solo limitation does not
authorize stable publication. If the three distinct roles are unavailable,
the highest honest release is `1.0.0-rc.N` unless governance is deliberately
redesigned before evaluation.

### Product slices

1. Freeze the reduced stable, experimental, and beta scope plus the
   compatibility map.
2. Build the minimal Guard feasibility spike for Codex CLI and Claude Code.
3. Record independent go/no-go decisions for hard Guard on each host.
4. Add the dual-manifest plugin skeleton, host adapters, local ESM boundary,
   and embedded build metadata.
5. Add strict checked-JS configuration and begin the type ratchet.
6. Implement and test exact-version deprecation status.
7. Integrate repo-continuity into the shared continuity engine.
8. Deliver `orient`, `resume`, `verify`, and `status` as vertical slices.
9. Implement the bounded receipt-only, non-enforcing lifecycle authorized by
   the 2026-07-28 amendment. Guard remains unimplemented unless separately
   proven and authorized.
10. Deliver thin `steer`.
11. Deliver `$kanon:aswitch` with last-plan-only as the default, a compacted
    handoff, receiving-side staleness validation, and a manual fallback.
12. Add narrowly supported terminal-launch adapters behind explicit beta
    capability labels.
13. Add full-history archives only if a documented or user-supplied export can
    be kept separate from the bootstrap context.
14. Complete stable-core adversarial, lifecycle, artifact, and platform tests.
15. Complete typed coverage for all stable shipped runtime modules.
16. Run development corpus and paired-ablation rehearsals.
17. Freeze one candidate commit and pack one artifact.
18. Run the sealed independent holdout once against that artifact.
19. Publish stable `1.0.0` only if every stable gate passes without
    post-result product changes.

## Stable v1 exit criteria

- [ ] Stable, experimental, and beta surfaces are clearly separated.
- [ ] The exact plugin artifact installs and exposes every stable skill in
      Codex CLI and Claude Code.
- [ ] Compatibility aliases behave as documented.
- [ ] Guard denial is proven on every surface for which it is claimed.
- [ ] A Guard result from one host is never promoted to another host.
- [ ] Unsupported or unavailable host hook introspection remains `Unknown`;
      the absence of a shipped Kanon lifecycle-notice hook remains explicit.
- [ ] Receipts are scoped, invalidated, bounded, and recoverable.
- [ ] Read workflows do not mutate repository or Git metadata.
- [ ] Live evidence overrides conflicting continuity state.
- [ ] Deprecation warnings work without making offline analysis unavailable.
- [ ] `aswitch` defaults to last-plan-only and supports a bounded compacted
      handoff.
- [ ] `aswitch` succeeds through a manual fallback when no launch adapter is
      supported.
- [ ] A receiving handoff validates schema, checksum, canonical root, recorded
      commit, and any complete change-set fingerprint; mismatches remain
      `Stale` and unavailable comparisons remain `Unknown`.
- [ ] Any shipped full-history mode uses only a documented or user-supplied
      export, remains a separate untrusted archive, and is labeled
      experimental.
- [ ] Every stable shipped runtime module passes strict checked-JS validation.
- [ ] Runtime schemas protect every external stable boundary.
- [ ] Stable trust, resource, and failure invariants have adversarial tests.
- [ ] The exact installed artifact passes Ubuntu, Windows, and macOS
      conformance.
- [ ] Development evaluation is complete and honestly reported.
- [ ] Implementation author, labeler, and reviewer are distinct recorded
      people.
- [ ] Independent labels and policy were sealed before release predictions.
- [ ] Any incremental-value claim has a separate paired sealed holdout;
      otherwise release documentation explicitly makes no such claim.
- [ ] Candidate, reports, tag, and published artifact hashes agree.
- [ ] No unresolved P0/P1 remains.
- [ ] The candidate worktree is clean.

If Guard cannot meet its claimed surface contract or external release roles
are unavailable, publish an RC rather than weakening the gates.

## Beta launch-adapter minimum safety gate

Even though adapter completeness does not block stable v1, any shipped
automatic launch path must:

- preview the resolved executable, working directory, handoff path, and
  sanitized argument array;
- require explicit user approval;
- keep raw repository content out of process arguments;
- validate and contain handoff paths;
- fail safely to a manual handoff; and
- label unsupported adapters and terminal surfaces.

The adapter does not stop or supervise either agent and does not imply
exclusive ownership. Reverse directions and additional terminal surfaces
graduate independently after dedicated evidence.

## Remaining decisions

Resolve before implementation freeze:

1. Name the two external release-governance participants and confirm their
   availability.
2. Decide whether beta launch adapters install enabled or require explicit
   opt-in.
3. Decide which Codex-to-Claude, Claude-to-Codex, and terminal adapters are
   attempted first.
4. Decide whether the experimental full-history archive ships in v1 or remains
   deferred.

## Sources

- [OpenAI: Build plugins](https://developers.openai.com/plugins/build/plugins)
- [OpenAI: Hooks](https://learn.chatgpt.com/docs/hooks)
- [Claude Code: Create plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code: Hooks](https://code.claude.com/docs/en/hooks)
- [`RELEASING.md`](RELEASING.md)
- [`eval/PROTOCOL.md`](eval/PROTOCOL.md)
- [`eval/PAIRED_ABLATION.md`](eval/PAIRED_ABLATION.md)
