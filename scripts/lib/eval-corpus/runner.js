import os from "node:os";
import path from "node:path";
import { analyzeRepo } from "../../../src/index.js";
import { ensureCheckout } from "./checkout.js";
import { aggregateScores, scoreCase } from "./scoring.js";

export function runCorpus(corpus, options = {}) {
  const cacheRoot = path.resolve(
    options.cacheRoot ||
      process.env.KANON_CORPUS_CACHE ||
      path.join(os.tmpdir(), `kanon-corpus-v${corpus.schema_version}`)
  );
  const selected = options.repoIds?.length
    ? corpus.cases.filter((item) => options.repoIds.includes(item.id))
    : corpus.cases;
  if (selected.length === 0) {
    throw new Error("No corpus cases matched the requested --repo value.");
  }

  const results = [];
  for (const item of selected) {
    options.onProgress?.({ phase: "checkout", id: item.id });
    const checkout = ensureCheckout(item, {
      cacheRoot,
      fetch: options.fetch !== false
    });
    options.onProgress?.({ phase: "analyze", id: item.id });
    const analysis = analyzeRepo(checkout, {
      runId: `eval-${item.revision.slice(0, 12)}`,
      scan: {
        maxFiles: 25_000,
        maxFileBytes: 1_000_000
      }
    });
    results.push(scoreCase(item, analysis, corpus.policy));
  }

  return {
    corpus: {
      schema_version: corpus.schema_version,
      label_version: corpus.label_version,
      selected_cases: selected.map((item) => item.id)
    },
    cache_root: cacheRoot,
    results,
    summary: aggregateScores(results, corpus.policy)
  };
}
