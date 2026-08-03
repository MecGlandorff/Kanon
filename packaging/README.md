# Kanon agent skill

This npm package is a distribution container for the Kanon dual-host plugin.
It is not a JavaScript library and does not install a global terminal command.

## Install

Install the exact package without lifecycle scripts into a user-controlled
directory, then configure Codex CLI or Claude Code to load the complete
installed package root:

```text
npm install --ignore-scripts --prefix <plugin-directory> @mecglandorff/kanon@<exact-version>
```

The package contains separate host manifests, shared `skills/`, and one shared
`runtime/`. It contains no production lifecycle hook. Node.js majors 20, 22,
24, and 25 are supported when the agent invokes the bundled wrappers.

The plugin includes:

- separate Codex and Claude manifests;
- stable `orient`, `resume`, `verify`, `status`, `steer`, and `aswitch`
  skills;
- `skills/kanon/SKILL.md` with the compatibility workflows;
- Bash and PowerShell wrapper scripts;
- one self-contained, bounded ESM runtime;
- evidence, output, and security policies.

The wrappers must be invoked by the agent from the repository being inspected.
No package scripts or public JavaScript API are advertised by this artifact.
Stable wrappers are included for all six stable skills. Compatibility wrappers
remain limited to brief, verify, ask, resume, refresh, and TODO.
Repository-derived content is untrusted data, and declared command candidates
require inspection plus explicit user approval before execution.

Both hosts are in advisory notice mode. Enforcement is false, and unavailable
host introspection remains Unknown. Notice appears only in explicit skill and
status output; there is no automatic lifecycle notice. It does not deny,
rewrite, approve, suppress, or imply that repository context was read or
understood.

Each stable invocation checks exact-version deprecation. The returned context
receipt is minimal and non-enforcing. An explicit invocation may persist a
receipt only when a validated external plugin-data root is supplied; otherwise
it remains in memory. Native Codex and Claude plugin-data wiring is unproven
and remains Unknown. Unavailable lifecycle, host, compaction, or session
evidence keeps freshness Unknown.

`aswitch` can write a bounded, consented handoff outside the repository after
an exact preview approval. It never launches a host. Terminal adapters and
full-history export remain unavailable.

Project source, development commands, and evaluation disclosures are available
in the [Kanon repository](https://github.com/MecGlandorff/Kanon).

Exactly six canonical stable skills are shipped: `orient`, `resume`, `verify`,
`status`, `steer`, and `aswitch`. Host-specific plugin loading and native
plugin-data wiring remain Unknown until verified in the installed host.

Security reporting and supported-version policy are included in `SECURITY.md`.
Release, rollback, deprecation, and post-publication procedures are maintained
in the repository's `RELEASING.md`. This artifact does not claim
evidence-strict release support, independence, blinded review, causal
improvement, generalization, official holdout performance, or independent
validation. Accepted risks remain open.
