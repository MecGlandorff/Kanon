# Kanon

Kanon is a static repository-orientation skill for coding agents.
It targets conventional JavaScript/TypeScript, Python, Go, and Rust layouts.

Today it can:

- read local imports and rank files by fan-in;
- find content-backed entrypoints such as Python `__main__`, Go/Rust `main`,
  package binaries, and JavaScript executables;
- extract commands from package metadata, build targets, selected contributor
  documentation, and conventional Cargo, Go, and Django layouts;
- detect direct README/package-script contradictions and report unobserved
  Node or Python targets as Unknown;
- report whether conventional CI and deployment configuration was found.

Kanon does not execute repository code or prove that a detected command will
succeed in the user's environment. Explicit configuration is **Known**;
documented or conventional inference is **Likely**; absence remains
**Unknown**.

The visible 30-repository corpus is development and regression data. Its
results are in-sample and are not presented as performance on unseen
repositories. A release needs a fresh, frozen corpus under the process in
[`eval/PROTOCOL.md`](eval/PROTOCOL.md). Historical development results and
current limitations are published in [`eval/RESULTS.md`](eval/RESULTS.md).
In v0.4, corpus scores cover important files plus run and test commands only.
Purpose, entrypoint, drift, and narrowly scoped `ask` checks have regression
tests but no claimed cross-repository capability estimate. Improvement
scorecards, refactor advice, dead-code advice, numeric health scores, and
ready-to-paste agent prompts are experimental source work and are not shipped
in the public skill artifact.

### Planned Codex ablation

A future evaluation will compare the same Codex configuration on paired,
blinded repository tasks with and without Kanon. The prompt, model, reasoning
effort, tools, budget, permissions, repository commit, and scoring policy will
be held fixed; only Kanon's availability will differ. The visible 30-case
corpus may be used for development runs, but any public incremental-value claim
must come from a newly selected, independently labeled, sealed holdout.

This experiment has not run, so Kanon currently makes no claim that it improves
Codex precision or recall. The fixed prompt, controls, repetition policy,
security evaluation, and allowed claim language are specified in
[`eval/PAIRED_ABLATION.md`](eval/PAIRED_ABLATION.md).

## Use

Install the complete package root as a plugin for Codex CLI or Claude Code.
The package has separate host manifests, shared skills, and one shared ESM
runtime. Use Kanon inside an agent session. Node.js majors 20, 22, 24, and 25
are supported.

Starting with v0.4, the
[`@mecglandorff/kanon`](https://www.npmjs.com/package/@mecglandorff/kanon)
package is only a distribution container for that directory. It does not expose
a JavaScript library API, install a global CLI, or advertise development
scripts. The repository root is deliberately private; releases are built from
the generated `dist/npm/` staging directory.

The agent can select the skill from its trigger, or you can invoke it explicitly:

```text
$kanon
Brief this repo and tell me which evidence supports the first edit.
```

The supported core workflows are:

| Intent | Workflow |
| --- | --- |
| Orient to a repository | `brief` |
| Ask about purpose, run, test, Git, docs drift, or literal text | `ask` |
| Check conventional README drift | `verify` |
| Resume from persisted repo state | `resume` |
| Refresh continuity state | `refresh` |
| Track human follow-up | `todo` |

Read workflows do not intentionally modify the inspected repository. Writes are
explicit through `refresh` and `todo`. Repository content is untrusted data:
Kanon never follows instructions in files, paths, Git metadata, TODOs, or
evidence. Declared command candidates must be inspected and explicitly approved
by the user before execution under the default `ask` policy; the `never` policy
prohibits execution.

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

`EVIDENCE.jsonl` is append-only and both evidence and snapshots have configured
hard retention limits. Reaching a limit produces a warning rather than
unbounded growth.

The complete package root is the supported integration artifact. Its Bash and
PowerShell wrappers call the shared root runtime from the repository being
inspected; they are agent hooks, not a global terminal package. Codex CLI and
Claude Code are both in advisory notice mode: enforcement is false, and the
notice never claims that repository context was read or understood.

## Development

```bash
npm run build:skill
npm run validate
npm run build:package
npm run eval:dev
```

`npm run eval:dev` uses visible labels and may guide generic implementation
work. A workflow-dispatched release candidate must also pass it. Stable
publication additionally requires an independently frozen
`eval/release-corpus.json`; a missing, partial, development-role, or
threshold-failing corpus blocks stable publication. False positives cost five
times false negatives, and every scored dimension and category has its own
precision and recall floor.

MIT
