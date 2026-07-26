# Experimental source boundary

The following source-tree modules are retained only for research and are not
part of the v0.4 public contract:

- `src/improve.js` and `src/improve/`
- `src/refactor.js` and `src/refactor/`
- `src/render/improve.js`
- `src/render/refactor.js`

They are not exported by `src/index.js`, reachable from the public CLI, copied
into `skills/kanon/`, included by the npm artifact allowlist, or claimed in
public capability documentation. Their heuristics, scorecards, dead-code
advice, refactor advice, and agent-prompt output have not passed the v0.4 trust
evaluation.

Moving any of these behaviors back into the public artifact requires a
separate evidence policy, adversarial tests, generic heuristic provenance, and
release evaluation.
