# Kanon

Kanon is a static, read-only repository orientation skill for coding agents.
It targets conventional JavaScript/TypeScript, Python, Go, and Rust layouts.

Today it can:

- read local imports and rank files by fan-in;
- find content-backed entrypoints such as Python `__main__`, Go/Rust `main`,
  package binaries, and JavaScript executables;
- extract commands from package metadata, build targets, selected contributor
  documentation, and conventional Cargo, Go, and Django layouts;
- detect stale npm, Node, and Python commands in a README;
- report whether conventional CI and deployment configuration was found.

Kanon does not execute repository code or prove that a detected command will
succeed in the user's environment. Explicit configuration is **Known**;
documented or conventional inference is **Likely**; absence remains
**Unknown**. The 30-repository corpus is the release gate for these claims, and
its current measured limitations are published in
[`eval/RESULTS.md`](eval/RESULTS.md).

## Use

Copy the complete `skills/kanon/` directory into your agent's skills directory.
Use Kanon inside an agent session. Node.js 20+ is required.

The agent can select the skill from its trigger, or you can invoke it explicitly:

```text
$kanon
Brief this repo and tell me which evidence supports the first edit.
```

The supported core workflows are:

| Intent | Workflow |
| --- | --- |
| Orient to a repository | `brief` |
| Answer an evidence-backed repo question | `ask` |
| Check conventional README drift | `verify` |
| Resume from persisted repo state | `resume` |
| Refresh continuity state | `refresh` |
| Track human follow-up | `todo` |

Read workflows do not modify the inspected repository. Writes are explicit
through `refresh` and `todo`.

## Evidence contract

Every claim is classified as:

- **Known** — directly backed by files, config, tests, or Git evidence
- **Likely** — supported by content or convention, but not proven
- **Unknown** — direct evidence was not found
- **Stale / suspicious** — contradicted by stronger repository evidence
- **Suggested** — a proposed next step, not a fact

Incomplete scans remain unknown. Commands include the working directory from
which they were detected.

## Local state

Explicit write workflows use `.kanon/`:

```text
KANON.md        repository brief
HANDOFF.md      resume brief
TODO.md         human follow-up
STATE.json      machine state
EVIDENCE.jsonl  evidence ledger
snapshots/      historical state
```

`skills/kanon/` is the supported integration artifact. Its Bash and PowerShell
wrappers call the bundled runtime from the repository being inspected; they are
agent hooks, not a global terminal package.

## Development

```bash
npm run build:skill
npm run validate
npm run eval:corpus
```

Release tags run the pinned corpus with a 5:1 false-positive penalty. A release
fails when its precision, recall, or weighted-error budget is missed.

MIT
