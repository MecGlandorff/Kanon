# Historical evaluation archive

The large v1.0.0 development-result payloads are preserved byte-for-byte in
the immutable `v1.0.0` tag at commit
`21c6d1df2cd2676354a9de6bab96e4651781a608` instead of being duplicated in
the maintained tree.

Retrieve an archived file with `git show v1.0.0:<path>`, or archive the
complete historical result tree with:

```sh
git archive --format=tar v1.0.0 -- eval/results
```

The v1.1 tree retains only compact records still used as characterization
fixtures or exact release-policy bindings. In particular, the following raw
payloads are archive-only:

- six D.2A schedule, score, mapping, injection, and raw-record files;
- the D.2E analysis admission and evidence manifest;
- 30 failed and 30 recovered D.2E per-case trace records plus their raw
  reports and intermediate manifests;
- the original standalone development report;
- 30 post-correction traces, the paired raw reports, and their intermediate
  manifests.

This removal covers 112 files, 105,745,394 tracked bytes, and 22,147 physical
lines as measured from the pre-removal working tree. It does not alter the
active development corpus, runtime, published package, or the compact frozen
summaries that current tests still characterize.
