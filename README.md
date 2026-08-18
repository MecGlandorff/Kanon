# Kanon

Kanon is a static repository-orientation skill for coding agents.
It targets conventional JavaScript/TypeScript, Python, Go, and Rust layouts.

Today it can:

- read bounded JavaScript/TypeScript and Python imports and rank files by
  fan-in;
- find fixed conventional JavaScript/Python entrypoint paths and root package
  exports or binaries;
- extract directly declared commands from package metadata, Python project
  scripts, and bounded Poe, Make, and Just targets;
- detect direct README/package-script contradictions and report unobserved
  Node or Python targets as Unknown;
- report whether conventional CI and deployment configuration was found.

Kanon does not execute repository code or prove that a detected command will
succeed in the user's environment. Explicit configuration is **Known**;
documented or conventional inference is **Likely**; absence remains
**Unknown**.

The v1.1 compatibility refresh intentionally does not synthesize conventional
Cargo, Go, or Django commands or project Go/Rust import and entrypoint code
intelligence. Their manifests and paths can still be observed as bounded
repository evidence.

The same versioned compact contract does not restore broad executable-syntax
or nested-manifest entrypoint discovery, and it does not rank literal local-file
references. Installed evaluation takes the first five files from the compact
important-file projection and records only the two ranking stages that run.

The visible 30-repository corpus is development and regression data. Its
results are in-sample and are not presented as performance on unseen
repositories. Any future public capability claim needs a fresh, frozen corpus
under the process in [`eval/PROTOCOL.md`](eval/PROTOCOL.md). Historical
development results and current limitations are published in
[`eval/RESULTS.md`](eval/RESULTS.md).
In v0.4, corpus scores cover important files plus run and test commands only.
Purpose, entrypoint, drift, and narrowly scoped `ask` checks have regression
tests but no claimed cross-repository capability estimate. Improvement
scorecards, refactor advice, dead-code advice, numeric health scores, and
ready-to-paste agent prompts are experimental source work and are not shipped
in the public skill artifact.

The v1.0.0 candidate follows the solo-maintainer `maintainer-stable` lane. Its
signed waiver and maintainer certification are exact mechanical inputs, while
accepted risks remain open. It does not establish evidence-strict release
support, independence, blinded review, causal improvement, generalization,
official holdout performance, or independent validation. The prospective
protocol remains inactive, and the six-person simulation is simulated
development evidence only.

The v1.1.0 release uses the standard engineering-validation lane: the complete
Node/OS test matrix, deterministic packaging, exact-tarball attestation, and
installed-artifact conformance. It does not turn the historical development
corpus into an evidence-strict, independence, improvement, or holdout claim;
accepted risks remain open.

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

Install the exact package without lifecycle scripts into a user-controlled
plugin directory, then configure Codex CLI or Claude Code to load the complete
installed package root:

```text
npm install --ignore-scripts --prefix <plugin-directory> @mecglandorff/kanon@<exact-version>
```

The package has separate host manifests, shared skills, and one shared ESM
runtime. Use Kanon inside an agent session. Node.js majors 20, 22, 24, and 25
are supported. Bash and PowerShell wrappers are included. Host-specific plugin
loading and native plugin-data wiring depend on the installed host and remain
Unknown until verified there.

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

The public artifact exposes exactly six canonical stable v1 skills:

| Stable skill | Behavior |
| --- | --- |
| `orient` | Load a small task-relevant body of repository evidence, with explicit limitations and a non-enforcing context receipt. |
| `resume` | Resume from authoritative live repository evidence while keeping stored continuity conflicts and Unknowns visible. |
| `verify` | Verify documentation, continuity, generated-artifact, declared-validation, and available receipt claims without inventing execution success. |
| `status` | Report embedded version, exact-version deprecation, notice mode, enforcement false, hook observability, receipt availability, and bounded diagnostics. |
| `steer` | Maintain one bounded evidence-aware implementation slice through Understand, choose, act, verify, and reassess without orchestrating or executing work. |
| `aswitch` | Prepare or receive a bounded consent-driven handoff between Codex CLI and Claude Code with a manual fallback. |

Every stable invocation consults the same exact-installed-version deprecation
checker. Network, host, hook, or session evidence that is unavailable remains
Unknown and does not block the read workflow.

The v0.4 compatibility workflows remain:

| Intent | Workflow |
| --- | --- |
| Orient to a repository | `brief` → stable `orient` |
| Ask one narrow purpose, run, test, Git, docs-drift, or literal-search question | `ask` → stable `orient` or `verify` |
| Check conventional README drift | `verify` → stable `verify` |
| Resume from persisted repo state | `resume` → stable `resume` |
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

`refresh` is a single-writer workflow: do not run concurrent refresh
processes for the same repository. Each replaced file is written atomically,
but a refresh is not a cross-file transaction. Evidence is appended before
the new state is published, so an interrupted write may leave unreferenced
evidence but cannot publish state that points to evidence it did not append.

The complete package root is the supported integration artifact. Its Bash and
PowerShell wrappers call the shared root runtime from the repository being
inspected; they are agent hooks, not a global terminal package. Codex CLI and
Claude Code are both in advisory notice mode: enforcement is false, and the
notice never claims that repository context was read or understood.

The slice 8 context receipt is advisory data only. It is not stored, enforced,
invalidated by hooks, or used to block mutation. Its freshness remains Unknown
when current evidence or a host-session binding is unavailable.

## Security and release status

Report vulnerabilities privately and review supported versions in
[`SECURITY.md`](SECURITY.md). Release, rollback, deprecation, exact-artifact
reuse, and post-publication verification are specified in
[`RELEASING.md`](RELEASING.md).

Release candidates are not publications. GitHub environment protection,
repository permissions, artifact-attestation availability, immutable-release
settings, npm trusted-publisher configuration, registry policy, and native
platform conformance remain Unknown until the applicable remote workflow
passes.

## Development

```bash
npm run build:skill
npm run validate
npm run build:package
npm run eval:dev
```

`npm run eval:dev` uses visible labels and may guide generic implementation
work, but it is not a stable-release capability claim. Stable publication is
gated by the full test matrix, deterministic exact-tarball packaging,
cross-platform installed-artifact conformance, and protected npm publishing.
The retired `maintainer-stable` evidence remains historical data for v1.0.0.
False positives cost five times false negatives, and every scored dimension
and category has its own precision and recall floor.

MIT
