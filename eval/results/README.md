# Historical evaluation archive

The large v1.0.0 historical evaluation payloads are preserved byte-for-byte in
the immutable `v1.0.0` tag at commit
`21c6d1df2cd2676354a9de6bab96e4651781a608` instead of being duplicated in
the maintained tree.

Retrieve an archived file with `git show v1.0.0:<path>`, or archive the listed
historical materials with:

```sh
git archive --format=tar v1.0.0 -- \
  eval/results \
  eval/v1.0.0-simulation/evidence-sha256-42f36e5fea80a84523995c5b394bcb8c4fc5b300a39b763d14277408cff96dc5 \
  docs/v1-run-package-declarations-withdrawal.md
```

The v1.1 tree retains only compact records still used as characterization
fixtures or exact release-policy bindings, together with the deterministic
simulation definitions and synthetic fixtures. In particular, the following
raw payloads and frozen evidence records are archive-only:

- six D.2A schedule, score, mapping, injection, and raw-record files;
- the D.2E analysis admission and evidence manifest;
- 30 failed and 30 recovered D.2E per-case trace records plus their raw
  reports and intermediate manifests;
- the original standalone development report;
- 30 post-correction traces, the paired raw reports, and their intermediate
  manifests;
- the candidate-level post-correction comparison and evaluation payloads;
- the package-declarations withdrawal and restoration decision record, whose
  material outcome remains summarized in the compact risk ledger;
- the failed D.2B raw development report and its case/path predeclared
  taxonomy;
- the D.2D ranking evidence manifest (the compact ranking result remains for
  active analysis tooling);
- the all-candidate D.2E mechanism-analysis payload; and
- the 84-file synthetic tabletop evidence packet, including its access
  ledgers, handoffs, predictions, traces, and frozen result records.

This removal covers 203 files, 112,987,721 tracked bytes, and 29,753 physical
lines as measured from the pre-removal working trees. It does not alter the
active development corpus, runtime, published package, compact frozen
summaries, or simulation characterization fixtures that current tests use.
