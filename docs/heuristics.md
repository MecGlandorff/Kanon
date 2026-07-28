# Production heuristic provenance

Only registered, ecosystem-level evidence may influence production important
file selection. Repository-specific compatibility behavior requires a separate
compatibility-pack boundary and does not contribute to generic metrics.

| Heuristic | Generic rationale | Applicable ecosystems | Failure modes | Added before/after corpus exposure |
| --- | --- | --- | --- | --- |
| Root README | Repository-wide declared usage contract | All | May be stale or minimal | Before v0.4 corpus review |
| Root manifest | Declares package/module/workspace boundary | JavaScript, Python, Go, Rust | May describe tooling rather than product | Before |
| Workspace contract | Root workspace manifests declare package and task boundaries | JavaScript, polyglot | Does not necessarily identify the primary package | During visible development work |
| Manifest entrypoint | Direct binary declaration | JavaScript, Rust | Target may be optional or broken | Before |
| Executable syntax | Language-level executable structure | JavaScript, Python, Go, Rust | Examples also contain executable syntax | Before |
| Module-named entrypoint | Go module basename identifies a matching `cmd/<name>` executable | Go | A binary may use a historical or branded name | During visible development work |
| Local import fan-in | Shared dependency used by local modules | JavaScript, Python, Go, Rust | Utilities may dominate | During visible development work |
| Literal local reference | Other files explicitly point to target | All | Generated lists/docs may inflate counts | During visible development work |
| Root task contract | Repository-wide declared build tasks | All | Tasks may be internal or unavailable | Before |
| Framework declaration | Bootstrap/settings files directly name framework configuration modules | Python/Django | Dynamic configuration can override a declaration | During visible development work |
| Ecosystem test anchor | Documented Cargo/Python top-level test location | Python, Rust | May cover only part of the suite | During visible development work |
| Manifest command | Root package metadata directly declares a task | JavaScript, Python | Script may be unsafe or broken | Before |
| Documented command | Root/root-linked docs explicitly show a command | All | Docs may be stale or prose-like | Before |
| Ecosystem command convention | Published Cargo, Go, and Django task conventions | Python, Go, Rust | A repo wrapper may be required | Before |
| Polyglot root precedence | Root ecosystem manifest prioritizes matching code and commands over nested auxiliary packages | Polyglot | A nested package may be user-facing | During visible development work |

The executable registry is
[`src/code-intel/heuristics.js`](../src/code-intel/heuristics.js). Tests require
every production selection to name a registered heuristic. A substring
tripwire remains useful for accidental corpus tokens, but it is not described
as contamination control.
