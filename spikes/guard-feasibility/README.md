# Guard feasibility spike

This directory is a disposable, unshipped feasibility probe for v1 product
slices 2 and 3. It is not the v1 plugin skeleton, is not copied into the npm
artifact, and does not implement receipts or a Guard runtime.

`V_1design.md` remains authoritative. The probe exists to gather runtime
evidence separately for Codex CLI and Claude Code; documentation is design
input only and a result on either host has no bearing on the other.

## Host fixtures

| Host | Disposable fixture | Claimed test surface |
| --- | --- | --- |
| Codex CLI | `codex-cli/marketplace/plugins/kanon-guard-spike-codex/` | Local Codex CLI plugin loaded from a local marketplace on the current operating system. |
| Claude Code | `claude-code/plugin/` | Local Claude Code plugin loaded with `--plugin-dir` on the current operating system. |

Neither fixture is a claim that a future release can use the same installation
or trust lifecycle. The runners record the exact CLI version and host surface
in their report.

## Checklist

Each host runner records a separate outcome for every required feasibility
question:

1. plugin hook discovery and trust or the host's closest observable trust
   state;
2. `PreToolUse` interception for shell and mutation/patch tools;
3. the documented deny and rewrite response schemas;
4. presence of `session_id`, `turn_id`, `cwd`, plugin root, and writable plugin
   data, with identifiers and paths hashed before recording;
5. a resume attempt and a separately recorded compaction attempt;
6. disabled-hook behavior and untrusted-hook behavior where the host exposes
   them; and
7. the exact host, CLI version, operating system, and terminal invocation used.

A missing event, missing field, unavailable authentication, ambiguous CLI
output, or an invocation that does not make the requested tool call is
`Unknown`; it is never converted into a negative capability conclusion.

## Probe behavior

The hooks inspect a bounded JSON payload from standard input. They never read
repository files, transcripts, session storage, or undocumented host state.
They write a short-lived write probe into host-provided plugin data and remove
it immediately. Sanitized observations are written only to the runner-provided
evidence path; raw session IDs, turn IDs, paths, tool arguments, and model
output are not retained.

Reports retain the executable and fixed flags for every host invocation. Dynamic
session IDs, scratch paths, and prompts are represented by fixed placeholders
and hashes so the invocation remains auditable without retaining sensitive
runtime data.

Covered `PreToolUse` tool input containing `KANON_GUARD_SPIKE_DENY` receives
the documented deny response. A Bash input containing
`KANON_GUARD_SPIKE_REWRITE` receives the documented allow-plus-`updatedInput`
response and is rewritten to create
`kanon-guard-spike-rewrite-output.txt` in the host session cwd. All other
inputs are observed without changing the tool call.

The host runners are intentionally opt-in and require `--execute`; static
tests never invoke a host CLI or model. Running a host probe can use the
currently authenticated coding-agent account and, for Codex, temporarily adds
and removes the disposable local marketplace. Both hosts may persist the
session metadata needed for the explicit resume check. The runners must
therefore be reviewed before execution and their reports must be treated as the
only runtime evidence.

## Result discipline

`guard` is not selected by this spike. A host can be a go candidate only if
the report directly proves all claimed denial behavior on its named surface,
including an enabled/trusted lifecycle appropriate to that host. Any missing
direct proof is recorded as `Unknown` or `no-go` and requires a user decision
before a later Guard or receipt slice.
