# Kanon v1 Guard feasibility result

**Status:** Run A product slice 3. Hard stop after this result.

**Authority:** [`V_1design.md`](../V_1design.md) remains the frozen contract.
This record does not change it, select notice mode, revise the stable promise,
or authorize product slice 4.

## Evidence boundary

The disposable host implementations are committed in `ff78ee1`. The final
sanitized runtime reports are:

- [Codex CLI 0.145.0 on macOS arm64](../spikes/guard-feasibility/results/codex-cli-0.145.0-macos.json),
  SHA-256
  `47dad5a64845242ed99ea3873c024ef285350cb3b2e154c50549c748bfb51ec1`;
- [Claude Code 2.1.219 on macOS arm64](../spikes/guard-feasibility/results/claude-code-2.1.219-macos.json),
  SHA-256
  `8a12575b0f0841cc30c880ce8855364cae8b9a9de3485fc26f2029e7cbdf5182`.

The reports retain process status, bounded output hashes, sanitized invocation
metadata, hook observations, and side-effect results. They do not retain raw
prompts, model output, session identifiers, turn identifiers, or scratch paths.
Official OpenAI and Anthropic documentation informed the probe shape but is not
runtime proof. A result from either host is not evidence for the other.

Earlier interrupted, pre-correction, and timeout-only observations were
invalidated and overwritten. They are not part of this decision.

## Independent decisions

| Host surface | Hard Guard decision | Decision basis |
| --- | --- | --- |
| Codex CLI `codex exec`, 0.145.0, macOS arm64 | **No-go** | Covered denial and rewrite behavior was directly proven only with the explicit hook-trust bypass. Persisted trusted-hook execution and compaction remain Unknown. |
| Claude Code `claude --plugin-dir`, 2.1.219, macOS arm64 | **No-go** | Authentication was unavailable, so no model, hook, shell, or patch attempt ran. Every Guard behavior remains Unknown. |

No `guard` claim is made for either host. No `notice` mode is selected.

## Codex CLI evidence

### Known

- The disposable marketplace and plugin installed after an absence preflight.
- With `--dangerously-bypass-hook-trust`, the plugin emitted `SessionStart` and
  `PreToolUse` observations.
- A marked `Bash` call reached `PreToolUse`, returned the deny response, and
  created no requested marker file.
- A marked `apply_patch` call reached `PreToolUse`, returned the deny response,
  and created no requested marker file.
- A marked `Bash` call returned the allow-plus-`updatedInput` response. The
  original side effect was absent and the rewritten file contained the expected
  fixed content.
- Turn-scoped observations contained session ID, turn ID, canonical cwd,
  plugin root, and writable plugin data. The host-provided plugin-data path had
  a two-directory missing suffix; the bounded probe created that suffix, wrote
  and removed its probe, and removed both created directories.
- Resume preserved the session identity, emitted `SessionStart` with source
  `resume`, reached the marked `Bash` hook, and denied its side effect.
- All host calls completed without timeout or output overflow.
- Plugin removal, marketplace removal, their list-based absence checks, and
  scratch removal succeeded. A separate post-run read-only check also found the
  exact disposable plugin and marketplace names absent.

### Likely

- In the invocation without the trust bypass, no hook observation appeared and
  the requested shell side effect existed. This is consistent with the
  untrusted plugin hook being skipped, but it does not independently identify
  trust as the only cause.
- With hooks disabled, no hook observation appeared and the requested shell
  side effect existed. This is consistent with disabled-hook behavior, but the
  negative observation is retained as Likely rather than direct proof.

### Unknown

- Whether the same covered denials work after the exact hook definition is
  interactively reviewed and persisted as trusted. The bypass invocation is
  not evidence of persisted trust.
- Compaction behavior. Sending `/compact` through the resumable non-interactive
  surface produced another `SessionStart` source of `resume`, not `compact`.
  This is non-observation, not proof that compaction is unsupported.
- Any other Codex surface, CLI version, operating system, architecture, or
  covered-tool set.

### Stale / suspicious

- Official trust and hook documentation is design input only.
- Any result produced before the final harness corrections is stale and
  excluded.

### Suggested

- If hard Guard is still desired on Codex CLI, separately authorize a controlled
  interactive trust-and-compaction probe with an explicit rollback plan.
- Otherwise, make the product decision required by the frozen design; this run
  does not choose notice mode or revise the stable promise.

## Claude Code evidence

### Known

- `claude --version` returned `2.1.219 (Claude Code)`.
- `claude auth status` exited with status 1 and did not establish an
  authenticated session.
- The runner completed normally, made no model or tool attempts, and created no
  scratch state.

### Likely

- None.

### Unknown

- Plugin discovery and trust.
- Shell denial, Write/Edit denial, and rewrite behavior.
- Session ID, turn ID, cwd, plugin root, and plugin-data behavior.
- Resume, compaction, disabled hooks, and untrusted hooks.
- Any other Claude surface, CLI version, operating system, architecture, or
  covered-tool set.

Authentication blocked observation; it is not evidence that Claude Code cannot
deny covered tools.

### Stale / suspicious

- Documentation and the Codex result are not runtime evidence for Claude Code.

### Suggested

- If hard Guard is still desired on Claude Code, authenticate that host and
  repeat only the Claude probe in a separately authorized run.
- Otherwise, make the product decision required by the frozen design; this run
  does not choose notice mode or revise the stable promise.

## Residual risks

- The evidence is limited to the named non-interactive macOS arm64 CLI versions.
  It is not installed-artifact, cross-platform, IDE, desktop, web, or production
  Guard proof.
- Codex resume testing requires host-persisted session state. The CLI may retain
  the fixed probe prompts and former scratch paths in its normal session
  records. The probe did not read, edit, or delete undocumented session
  storage. Plugin, marketplace, plugin-data probe, and scratch filesystem state
  were removed.
- Codex model calls consumed normal authenticated account usage. Claude made no
  model call because its authentication check failed.
- The disposable probe proves only its fixed marked calls. A later production
  Guard would still require exact installed-artifact and lifecycle tests for
  every claimed tool and surface.

## Run A hard stop

Slices 1 through 3 are complete. The next work requires user judgment:

1. authorize the smallest host-specific follow-up needed to close the Unknown
   trust, compaction, or authentication evidence; or
2. accept one or both no-go results and decide whether and how to expose notice
   mode and revise the stable product promise.

Do not begin the dual-manifest production plugin skeleton, receipts, Guard
runtime, or any later product slice under Run A.

## Run A.1 corrective follow-up

**Date:** 2026-07-27.

**Status:** corrective feasibility work only. This additive record preserves the
original Run A reports as historically valid for their named runs. It does not
select notice mode, revise the stable promise, implement receipts, create a
production manifest, or start product slice 4.

### Provenance and immutable evidence

The harness corrections were committed before their corresponding host calls:

- `b126330` hardened trusted executable resolution, minimum child
  environments, redaction, scratch containment, report exclusivity, both
  runners, and their regressions;
- `21d0f0b` added only the bounded local `USER` identity that Claude's
  credential lookup required, without reporting its value;
- `786a7a6` added the `--verbose` flag required by Claude's structured stream
  output and its regression; and
- `291c39a` added a zero-model, read-only Codex persisted-trust and compaction
  preflight.

The original reports remain byte-for-byte unchanged:

- the original Claude report retains SHA-256
  `8a12575b0f0841cc30c880ce8855364cae8b9a9de3485fc26f2029e7cbdf5182`;
- the original Codex report retains SHA-256
  `47dad5a64845242ed99ea3873c024ef285350cb3b2e154c50549c748bfb51ec1`.

Run A.1 added these reports without overwriting either original:

- [Claude Code 2.1.219 Run A.1 follow-up 1](../spikes/guard-feasibility/results/claude-code-2.1.219-macos-run-a1-follow-up.json),
  SHA-256
  `537bcc0791cf0ed7b4b1da3305169e4e67cdc0064c86f4b5ae9a97d03ead8c6b`;
- [Claude Code 2.1.219 Run A.1 follow-up 2](../spikes/guard-feasibility/results/claude-code-2.1.219-macos-run-a1-follow-up-2.json),
  SHA-256
  `85225891fb1f0106c0daf0bef05aff504abe02adb3a605771ad4564e30b647c4`;
- [Codex CLI 0.145.0 Run A.1 persisted-trust/compaction preflight](../spikes/guard-feasibility/results/codex-cli-0.145.0-macos-run-a1-follow-up-persisted-trust-compaction-preflight.json),
  SHA-256
  `3950b7db9a89e8c34e056e9fbec56f944cb9325aa4910f9a9c362d3664b168d6`.

Follow-up 1 is retained because additive evidence must not be rewritten. It
showed that Claude requires verbose mode with stream JSON. Follow-up 2 used the
corrected invocation. Neither report is replaced or promoted beyond what it
directly proves.

Current local CLI help and official host documentation were reviewed before the
calls. For Codex, the official
[hook trust documentation](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks)
states that non-managed hooks require review of the exact definition in
interactive `/hooks`, records trust against the current hash, and distinguishes
the one-off trust bypass from persisted trust. The official
[developer-command reference](https://learn.chatgpt.com/docs/developer-commands#built-in-slash-commands)
defines `/compact` as an interactive command. For Claude, the official
[permission-mode](https://code.claude.com/docs/en/permission-modes),
[permission](https://code.claude.com/docs/en/permissions),
[hook](https://code.claude.com/docs/en/hooks), and
[CLI](https://code.claude.com/docs/en/cli-usage) references support `dontAsk`,
exact allow rules, `PreToolUse`, plugin paths, and compact lifecycle events.
Documentation constrained the probes; it is not runtime proof.

### Hardened boundary

Both runners now resolve one canonical executable outside the repository and
use that absolute path for every child process. Repository-local and relative
`PATH` candidates are rejected, and resolution fails closed. Child processes
receive only:

- a canonical trusted `PATH` containing the host, the current Node executable,
  and fixed operating-system directories;
- an existing `HOME`, the documented host state-root override when present,
  and the bounded local `USER` name only for Claude credential lookup;
- bounded locale values;
- runner-owned `TMPDIR`, `TMP`, and `TEMP`; and
- fixed no-color/update/Claude-memory controls plus the two runner-owned
  evidence paths during a probe.

API keys, tokens, proxy variables, shell startup controls, `NODE_OPTIONS`, and
all other ambient values are omitted. Authentication status and documented
plugin-list output use status plus explicit booleans only: raw output, hashes,
byte counts, email, organization data, credentials, and tokens cannot enter a
follow-up report.

Claude uses `dontAsk`, exposes one built-in tool per attempt, and adds one exact
`Bash(command)` allow rule only where the fixed scratch side effect must remain
observable without a hook. It does not use
`--dangerously-skip-permissions`. Codex's Run A.1 preflight makes no model call,
uses no hook-trust bypass, installs nothing, and does not open the TUI.

Regression coverage proves that secret sentinels are not inherited,
repository-local executables cannot win resolution, Claude's dangerous bypass
flag is absent, sensitive auth output and its digest cannot enter reports,
reports cannot overwrite an existing path, scratch roots cannot be redirected
into the repository, and interruption cleanup remains bounded.

### Claude Code 2.1.219 follow-up decision

**Decision: no-go.**

#### Known

- An independent boolean-only check using the corrected minimum environment,
  and both additive reports, established `loggedIn: true`. No authentication
  identity or raw authentication output was retained.
- The trusted canonical executable reported `2.1.219 (Claude Code)`.
- The disposable plugin's `SessionStart` hook was discovered on the four
  hook-enabled first-turn attempts in both follow-ups. Its sanitized
  observations established startup source, session-ID presence, matching
  scratch cwd, plugin-root presence, and writable plugin data.
- Follow-up 2 used the CLI-required verbose structured-stream mode. Its
  hook-disabled control completed with status 0, without timeout or overflow.
- Exact requested side effects were absent or preserved as recorded. No
  `PreToolUse` denial or rewrite event was observed, so side-effect absence is
  not promoted to Guard proof.
- Each runner removed its own scratch root and completed normally.

#### Likely

- None. Negative side effects without the required tool-hook observation do not
  satisfy the direct-proof threshold.

#### Unknown

- Untrusted-hook and separately trusted-hook behavior for `--plugin-dir`.
- `Bash`, `Write`, and `Edit` denial, plus Bash rewrite schema and effect. The
  hook-enabled attempts exited nonzero after `SessionStart` and before an
  observed `PreToolUse`; their raw model and error output was not retained.
- Turn metadata at `PreToolUse`, resume behavior, and a positive disabled-hooks
  control in which the model actually invokes the fixed tool.
- Real compaction. The runner did not send literal `/compact` text through the
  incompatible print-mode path, and no interactive Claude flow was opened.
- Any other version, operating system, architecture, terminal surface, tool
  set, or plugin trust surface.

The authenticated follow-up closes only the prior auth gap. Discovery,
scratch cleanup, and execution completion are proven; every required Guard
behavior remains below the direct-proof threshold.

### Codex CLI 0.145.0 follow-up decision

**Decision: no-go.**

#### Known

- The trusted canonical executable reported `codex-cli 0.145.0`; authentication
  was reduced to and reported as `logged_in: true`.
- The documented marketplace and plugin list commands returned valid JSON and
  did not contain the exact disposable marketplace or plugin name.
- The follow-up made zero model calls, invoked no install/remove/exec command,
  opened no interactive flow, used no hook-trust bypass, and left documented
  plugin state unchanged.
- Runner-owned scratch removal and normal completion were directly verified.
- The original Codex report remains the historical proof for the fixed
  bypass-backed denial, rewrite, metadata, resume, and lifecycle observations;
  that evidence is not relabeled as persisted trust.

#### Likely

- None in the Run A.1 preflight.

#### Unknown

- Execution after the exact hook hash is reviewed and persisted through
  interactive `/hooks`.
- Actual `/compact` execution and its compact lifecycle observation.
- Complete rollback of persisted hash trust. Current CLI help and official
  documentation expose documented plugin and marketplace removal, and `/hooks`
  can disable a hook, but no supported command was found that removes the
  persisted hook-hash trust decision without inspecting undocumented internals.

Because the preflight could not establish a complete documented rollback, Run
A.1 did not automate TUI input, install the disposable plugin, create
persistent trust, or request approval for an unsafe approximation. The additive
report contains the exact bounded manual sequence: explicit approval, absence
preflight, exact disposable install, `/hooks` review without the bypass, one
fixed denial turn, real `/compact`, exact plugin/marketplace removal, absence
verification, and scratch cleanup. The residual persisted hash decision must be
accepted explicitly or a documented removal mechanism must first be identified.

The bounded manual sequence, which was **not run**, is:

1. Obtain explicit approval for two documented host-state additions, an
   interactive session of at most two model turns, and the possibility that one
   inert exact-hash trust decision cannot be removed through documented CLI
   commands.
2. Run the hardened `--preflight-only` mode with another new additive report
   filename. Require authentication and exact-name absence to be `proven`.
3. Add only the fixture marketplace:
   `codex plugin marketplace add spikes/guard-feasibility/codex-cli/marketplace --json`.
4. Add only the fixture plugin:
   `codex plugin add kanon-guard-spike-codex@kanon-guard-spike-codex --json`.
5. Use a separately reviewed launcher that calls the already-hardened minimum
   environment builder, creates a fresh runner-owned scratch workspace, and
   opens Codex with workspace-write sandboxing, web search/apps/multi-agent
   disabled, and no trust bypass. Such a launcher was not added in Run A.1, so
   launching the TUI directly from a broad shell environment is not approved.
6. In that TUI, open `/hooks`, review the exact source and hash, and trust only
   the disposable hook. Run one fixed marked Bash-denial prompt; require the
   `PreToolUse` denial observation and absence of its exact scratch marker.
7. In the same session, enter the real `/compact` command; require the
   disposable `SessionStart` observation with source `compact`. Exit without a
   third model turn.
8. Remove only the exact plugin and marketplace:
   `codex plugin remove kanon-guard-spike-codex@kanon-guard-spike-codex --json`,
   then
   `codex plugin marketplace remove kanon-guard-spike-codex --json`.
9. Re-run `--preflight-only` under a new additive report filename, require both
   exact names absent, and remove only the launcher-created scratch directory.
   Do not inspect, translate, edit, or delete undocumented session or trust
   internals.

### Usage and cleanup bounds

- Claude follow-up 1 ran five attempts with a per-attempt maximum of USD 0.05
  (USD 0.25 maximum). Follow-up 2 ran six attempts under the same cap (USD 0.30
  maximum). Six bounded flag-diagnostic calls used a USD 0.001 maximum each.
  The conservative Run A.1 Claude account maximum is therefore USD 0.556,
  irrespective of lower actual billing or attempts that failed before a model
  response.
- Each reported Claude attempt was limited to 180 seconds, 8 MiB per output
  stream, one exposed built-in tool, fixed scratch paths, and exact side-effect
  checks. Both report cleanups say `scratch-remove: true`.
- The Codex follow-up used zero model turns and therefore zero incremental model
  spend. Each status/list command had a 30-second timeout and an 8 MiB
  per-stream limit. It installed no plugin or marketplace; both exact names
  were absent, and its scratch cleanup says `removed: true`.
- A post-run direct temporary-root scan found no Claude runner directory. It
  found one older Codex runner directory whose filesystem birth time
  (20:59 local) predates the first Run A.1 commit (22:17 local). It was not
  created by these follow-ups and was left untouched under the prohibition on
  destructive cleanup of pre-existing state.
- Normal host session records may have been created. Run A.1 did not read,
  edit, translate, or delete undocumented Claude or Codex session internals.

### Remaining priority and residual risk

No open harness P0 or P1 was identified after the correction loop and passing
regressions. The remaining items are evidence and product-decision risks, not
permission to weaken the threshold:

- Claude's required denial, rewrite, resume, disabled-hooks, trust, and
  compaction behavior is still Unknown.
- Codex persisted trust, actual compaction, and complete trust rollback are
  still Unknown.
- Both decisions are restricted to the named macOS arm64 CLI versions and
  disposable fixtures.
- The older pre-existing Codex scratch directory remains outside the repository
  and was intentionally not removed.
- The probes are not installed-artifact or production-manifest proof.

### Run A.1 hard stop

Run A.1 ends here and does not start product slice 4. Before Run B, the user
must explicitly choose one of these paths:

1. authorize a separately supervised Codex interactive verification, accepting
   the documented possibility that the exact hook-hash trust record remains as
   inert residual user state, with at most two model turns and the report's
   exact plugin/marketplace/scratch rollback; or
2. accept the independent Claude and Codex no-go decisions and make the
   frozen-design product decision about whether and how to expose notice mode
   and revise the stable promise.

Neither choice is made by this document.

## Run A.2 final supervised Codex verification

**Date:** 2026-07-27.

**Decision: no-go. Hard stop after Run A.2.**

Run A.2 exercised only Codex CLI. It did not work on Claude Code, select
notice mode, revise the stable promise, implement receipts or production
Guard, create product manifests, or begin product slice 4.

### Provenance and additive reports

The safe interactive launcher and its regressions were committed before any
Codex plugin-state mutation:

- source commit
  `08de9290db031b49119f1dd33522db65573f2e48`, whose parent is the required
  Run A.1 commit
  `17707f3e65dfb2ef309391d363590210199b9d56`;
- source-bundle SHA-256
  `66cdf5bfa4def30bb76da3d4dc503825e35fb1a4ca0a693a44514ba7b3caed8a`;
- committed disposable-fixture SHA-256
  `c0f6d3ef18f5d17673ac5970d6938e36310988ee2cfcb3ce7d9c98d0fa80290c`.

Run A.2 added four reports without replacing any Run A or Run A.1 evidence:

- [zero-model preflight](../spikes/guard-feasibility/results/codex-cli-0.145.0-macos-run-a2-persisted-trust-compaction-preflight.json),
  SHA-256
  `05e354743e58ec902602f19de29d415a8ac25a21fc68a59b23f73c744768b693`;
- [hardened launcher report](../spikes/guard-feasibility/results/codex-cli-0.145.0-macos-run-a2-supervised-persisted-trust-real-compaction.json),
  SHA-256
  `cb9fb5ad3973f7f7f305a29cf93c378d594a22547f05d2a3e9c3e47f08295b2d`;
- [zero-model post-cleanup check](../spikes/guard-feasibility/results/codex-cli-0.145.0-macos-run-a2-post-cleanup.json),
  SHA-256
  `067810ce08aa022ebbe385cc3e1065fcf689f33a015cda63dd6ddc74d39b4537`;
- [final supervised outcome](../spikes/guard-feasibility/results/codex-cli-0.145.0-macos-run-a2-supervised-outcome.json),
  SHA-256
  `456be74f897b3a30cf8828db96ca8db639432f51765423dadf5a79724b5dbfc9`.

The final supervised outcome binds the other three reports, the source commit,
the source SHA-256, and the fixture SHA-256. Reports retain only bounded
sanitized process status, fixed identities, lifecycle summaries, booleans, and
hashes. They retain no raw prompt, model output, authentication output,
credential, session identifier, or filesystem path.

### Hardened launcher boundary

The launcher had no caller-controlled prompt, marketplace, plugin, workspace,
model, or extra-flag surface. It:

- resolved and used the canonical Codex executable outside the repository;
- reused the minimum child environment and added only fixed terminal and
  runner-owned evidence values;
- created one fresh scratch workspace outside the repository;
- fixed the sandbox to `workspace-write` and approvals to user-reviewed
  `on-request`;
- disabled web search, command network access, apps/connectors, configured MCP
  servers, memories, multi-agent behavior, browser/computer-use, plugin
  sharing, dependency discovery, analytics, and update checks for the
  process;
- used neither dangerous bypass;
- verified the committed fixture hashes and the documented installed
  marketplace/plugin identity; and
- bounded the intended interactive work to one denial turn followed by one
  real `/compact` operation, with no third model turn.

Codex exposes no documented session-only include-list for installed local
plugins. Run A.2 therefore left unrelated persistent plugin state untouched
and records that limitation as residual risk.

### Direct runtime outcome

The fresh preflight proved authentication and exact-name absence through valid
documented JSON. It made zero model calls, changed no host plugin state, and
removed its scratch directory.

The launcher then added only the exact committed marketplace and
`kanon-guard-spike-codex@kanon-guard-spike-codex`, and verified the installed
identity. On opening the TUI, Codex presented a project-directory trust
decision before the required `/status` and `/hooks` review. Persisting trust
for the disposable scratch directory was an additional user-state change not
covered by the authorization. The supervisor declined it instead of guessing
or broadening authority.

Consequently:

- `/status` and `/hooks` were not reached;
- no hook definition or hash was trusted;
- the denial probe was not submitted;
- no `PreToolUse` observation or deny response occurred;
- the exact marker was directly absent, but absence alone is not denial proof;
- `/compact` was not invoked and no compact lifecycle event occurred;
- zero model turns were submitted; and
- no third model turn occurred.

The launcher report contains a fixed
`bounded_model_usage.observed_sequence` intended-sequence label. That label is
not a runtime observation and is stale for this stopped run. The additive final
outcome supersedes it with the directly observed count of zero submitted model
turns.

### Evidence classification

#### Known

- Codex reported `codex-cli 0.145.0` on macOS arm64.
- Authentication, source binding, fixture identity, exact-name preflight, and
  installed identity were directly proven.
- The extra project-directory trust prompt appeared and was declined.
- Run A.2 created no project-directory trust and never reached exact hook-hash
  trust.
- Zero model turns were submitted.
- The exact marker remained absent.
- Exact plugin removal and marketplace removal both exited successfully.
- Valid documented list output showed both exact names absent during launcher
  cleanup and again in a separate zero-model post-cleanup check.
- Launcher scratch removal succeeded, and a direct existence check found the
  exact launcher-owned root absent.
- No undocumented Codex state was inspected, edited, translated, or deleted.

#### Likely

- None. An absent marker without a matching tool-hook observation is not
  promoted.

#### Unknown

- Persisted execution after review and trust of the exact disposable hook
  hash.
- A matching `PreToolUse` deny response and its causal relationship to marker
  absence.
- Real `/compact` lifecycle behavior.
- Complete in-session configuration display, because `/status` was not
  reached.
- Any other Codex version, operating system, architecture, terminal surface,
  tool, fixture, installed artifact, or production Guard behavior.

#### Stale / suspicious

- The launcher report's intended-sequence label is not actual model-usage
  evidence for this stopped run.
- Documentation and the older trust-bypass result remain design and historical
  evidence; neither supplies the missing Run A.2 persisted-trust or compact
  observations.

### Cleanup, usage, and residual state

The exact disposable plugin and marketplace were removed and separately proven
absent. The launcher-owned scratch root and both read-only runner scratch roots
were removed. Cleanup is complete for the documented state created by Run A.2.

The interactive surface was opened once. It submitted zero model turns, so the
bounded model-turn usage was `0 / 2`; the denial turn, compact operation, and
third turn were all absent.

Ordinary host session records remain untouched as authorized. Run A.2 did not
create an exact-hook-hash trust decision because `/hooks` was never reached.
Whether any pre-existing or host-internal matching residue exists remains
Unknown and was not inspected. No project-directory trust was created.

After cleanup and report emission, the launcher wrapper required a terminal
interrupt because its supervision input stream remained active. The report and
all documented cleanup checks had already completed. This is retained as a
launcher residual risk, not hidden as normal exit.

### Decision required before Run B

Codex CLI hard Guard remains no-go. Before Run B, the user must make exactly
this product decision:

1. explicitly accept the Codex CLI hard-Guard no-go and select a documented
   `notice`-mode revision to the frozen stable promise; or
2. do not begin Run B.

`guard` cannot be selected from this evidence. Run A.2 ends here regardless of
outcome.
