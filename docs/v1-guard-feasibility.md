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
