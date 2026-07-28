# Kanon agent skill

This npm package is a distribution container for the Kanon dual-host plugin.
It is not a JavaScript library and does not install a global terminal command.

## Install

Install or download the package, then install the complete package root as a
plugin for Codex CLI or Claude Code. The package contains separate host
manifests, shared `skills/` and `hooks/`, and one shared `runtime/`. Node.js
major 20, 22, 24, or 25 is required when the agent invokes the bundled
wrappers or advisory hook.

The plugin includes:

- separate Codex and Claude manifests;
- stable `orient`, `resume`, `verify`, and `status` skills;
- `skills/kanon/SKILL.md` with the compatibility workflows;
- Bash and PowerShell wrapper scripts;
- one self-contained, bounded ESM runtime;
- evidence, output, and security policies.

The wrappers must be invoked by the agent from the repository being inspected.
No package scripts or public JavaScript API are advertised by this artifact.
Stable wrappers are included for the four read skills. Compatibility wrappers
remain limited to brief, verify, ask, resume, refresh, and TODO.
Repository-derived content is untrusted data, and declared command candidates
require inspection plus explicit user approval before execution.

Both hosts are in advisory notice mode. Enforcement is false, and unavailable
host introspection remains Unknown. The notice does not deny, rewrite, approve,
suppress, or imply that repository context was read or understood.

Each stable invocation checks exact-version deprecation. The returned context
receipt is minimal, non-persisted, and non-enforcing; unavailable evidence or
host-session binding keeps freshness Unknown.

Project source, development commands, and evaluation disclosures are available
in the [Kanon repository](https://github.com/MecGlandorff/Kanon).
