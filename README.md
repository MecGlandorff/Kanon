# Kanon

Never lose the thread of a repo again.

Kanon changes what an AI coding agent knows about a repo before it answers, plans, or edits.

It briefs the current repo state from files, config, tests, docs, and local Kanon memory: what the repo does, how it works, what is stale, what is unknown, and where to start.

```bash
npx @mecglandorff/kanon brief
npx @mecglandorff/kanon verify README.md
```

## Why

AI coding agents answer from the context they are given. If that context is a stale README, a partial file view, or an old project memory, the agent can sound confident while being wrong.

Kanon changes the starting point. Before the agent speaks, it reconstructs the repo's current state from evidence and gives humans and agents a shared brief of what is known, likely, unknown, stale, and suggested.

Use it when you clone or fork a repo, return to old work, review someone else's project, or want Codex/Claude to work from reliable repo context instead of guesswork.

Kanon answers:

> I just opened this repo. What does it do, what is trustworthy, what is stale, and where should I start?

## Commands

```bash
kanon brief              # Evidence-backed repo orientation
kanon verify README.md   # README / repo drift report
kanon ask "what is left?"
kanon resume             # Resume from the last Kanon checkpoint
kanon refresh            # Write .kanon/ continuity files
```

`kanon brief`, `kanon verify`, `kanon ask`, and `kanon resume` are read-only by default. Use `kanon refresh` or `--write` to write `.kanon/`.

## What Kanon Writes

```text
.kanon/
  KANON.md        human-readable repo continuity
  STATE.json      machine-readable repo state
  EVIDENCE.jsonl  append-only evidence trail
  HANDOFF.md      latest resume brief
  config.json     local Kanon config
  snapshots/      timestamped state snapshots
```

By default, `.kanon/KANON.md` is the shareable continuity doc. Volatile machine files are ignored by `.kanon/.gitignore`.

## Evidence Model

Kanon separates claims into:

- Known: backed by files, config, tests, or explicit Kanon evidence
- Likely: plausible from naming, structure, or conventions
- Unknown: no supporting evidence found
- Stale / suspicious: repo evidence conflicts with docs or claims
- Suggested: useful next steps inferred from the evidence

Code, config, and tests outrank README content for current behavior. README content remains useful for declared intent.

## Skill Package

The repo ships a Codex/Claude-compatible skill under `skills/kanon/`. Use it when opening, resuming, onboarding, auditing, or explaining a repository.

```text
$kanon
Brief this repo and tell me the safest first contribution.
```

## Development

```bash
npm test
node ./bin/kanon.js brief
node ./bin/kanon.js verify README.md
```
