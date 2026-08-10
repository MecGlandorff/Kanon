# Raw development reports

Committed development summaries must be generated from a raw JSON report in
this directory with:

```bash
npm run results:dev -- --input eval/results/<report>.json
```

Raw reports are in-sample compatibility records. They are not held-out
capability estimates.

Directories named `d2c-unblind-<result-hash-prefix>/` contain an exact masked
adjudication result plus additive unblinded evaluation analysis. They do not
replace frozen labels or define an official score.
