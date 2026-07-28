# Production heuristic provenance

Only registered, ecosystem-level evidence may influence production important
file selection. Repository-specific compatibility behavior requires a separate
compatibility-pack boundary and does not contribute to generic metrics.

| Heuristic | Generic rationale | Applicable ecosystems | Failure modes | Added before/after corpus exposure |
| --- | --- | --- | --- | --- |
| Root README | Repository-wide declared usage contract | All | May be stale or minimal | Before v0.4 corpus review |
| Root manifest | Root package manifests declare package/module/workspace boundaries; dependency/config filenames alone are ineligible | JavaScript, Python, Go, Rust | May describe tooling rather than product | Eligibility constrained during visible development work |
| Workspace contract | Root workspace manifests declare package and task boundaries | JavaScript, polyglot | Does not necessarily identify the primary package | During visible development work |
| Manifest entrypoint | Direct binary declaration, limited to one target in an ambiguous workspace | JavaScript, Rust | Target may be optional or secondary | Constrained during visible development work |
| Executable syntax | A unique language-level executable is structural evidence; competing executables require repository corroboration | JavaScript, Python, Go, Rust | A unique auxiliary tool may still be selected | Eligibility and command use constrained during visible development work |
| Module-named entrypoint | Go module basename identifies a matching `cmd/<name>` executable | Go | A binary may use a historical or branded name | During visible development work |
| Local import fan-in | Ranks an independently eligible shared dependency but does not create eligibility | JavaScript, Python, Go, Rust | Central files without direct evidence may be omitted | Eligibility constrained during visible development work |
| Literal local reference | Repository content explicitly points to a contained target; import syntax is not double-counted | All | Generated lists/docs may still point to secondary files | Double-counting removed during visible development work |
| Root task contract | Repository-wide declared build tasks | All | Tasks may be internal or unavailable | Before |
| Framework declaration | Bootstrap/settings files retain the directly named configuration and bounded inherited routing chain | Python/Django | Dynamic configuration can override a declaration | Alias handling constrained during visible development work |
| Manifest command | Root metadata declares a task; an exact root-script/workspace-binary name may form an alias | JavaScript, Python | Script may be unsafe or broken | Workspace alias added during visible development work |
| Documented command | Ordered root/root-linked docs explicitly show a contained command, cwd, phase, or executable component | All | Docs may be stale; equal evidence abstains | Parser strengthened during visible development work |
| Ecosystem command convention | Existing conventions contribute test candidates only | Python, Go, Rust | A repository-specific test wrapper may be required | Run synthesis removed during visible development work |
| Polyglot root precedence | Root ecosystem manifest prioritizes matching code and commands over nested auxiliary packages | Polyglot | A nested package may be user-facing | During visible development work |

The executable registry is
[`src/code-intel/heuristics.js`](../src/code-intel/heuristics.js). Tests require
every production selection to name a registered heuristic. A substring
tripwire remains useful for accidental corpus tokens, but it is not described
as contamination control.
