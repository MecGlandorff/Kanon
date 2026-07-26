# Kanon agent skill

This npm package is a distribution container for the self-contained Kanon
agent skill. It is not a JavaScript library and does not install a global
terminal command.

## Install

Install or download the package, then copy the complete `skills/kanon/`
directory into the skills directory used by Codex or Claude Code. Node.js
major 20, 22, 24, or 25 is required when the agent invokes the bundled
wrappers.

The copied directory includes:

- `SKILL.md` with the agent workflow;
- Bash and PowerShell wrapper scripts;
- the self-contained, bounded runtime;
- evidence, output, and security policies.

The wrappers must be invoked by the agent from the repository being inspected.
No package scripts or public JavaScript API are advertised by this artifact.
Only brief, verify, ask, resume, refresh, and TODO wrappers are included.
Repository-derived content is untrusted data, and declared command candidates
require inspection plus explicit user approval before execution.

Project source, development commands, and evaluation disclosures are available
in the [Kanon repository](https://github.com/MecGlandorff/Kanon).
