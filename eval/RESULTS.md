# Corpus results

The release gate is currently **green**. These numbers are published so README
claims cannot outrun measured behavior.

| Revision | Precision | Recall | Weighted error/case | Gate |
| --- | ---: | ---: | ---: | --- |
| `4f04000` before content-aware analysis | 23.2% | 12.7% | 20.30 | Fail |
| First content-aware candidate, 2026-07-26 | 73.4% | 67.3% | 10.57 | Fail |
| Confidence-budgeted candidate, 2026-07-26 | 99.4% | 82.9% | 1.33 | **Pass** |

Current candidate dimension results:

| Dimension | Precision | Recall | TP | FP | FN |
| --- | ---: | ---: | ---: | ---: | ---: |
| Important files | 99.2% | 86.7% | 130 | 1 | 20 |
| Run command | 100.0% | 57.1% | 16 | 0 | 12 |
| Test command | 100.0% | 88.9% | 24 | 0 | 3 |

The policy requires at least 80% overall precision, 60% recall, and at most
4.00 weighted errors per repository, with each false positive costing five
times a false negative. The current result has 170 true positives, one false
positive, and 35 false negatives for 40 weighted errors across 30 repositories.
The thresholds were not relaxed to make the candidate pass.

Reproduce the current measurement with:

```bash
npm run eval:corpus
```
