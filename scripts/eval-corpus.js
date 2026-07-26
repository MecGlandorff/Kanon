#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCorpus,
  renderCorpusReport,
  runCorpus
} from "./lib/eval-corpus.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const options = parseArgs(process.argv.slice(2));
  const corpus = loadCorpus(options.corpus || path.join(repoRoot, "eval", "corpus.json"));
  const run = runCorpus(corpus, {
    cacheRoot: options.cache,
    fetch: options.fetch,
    repoIds: options.repos,
    onProgress: options.json
      ? null
      : ({ phase, id }) => process.stderr.write(`${phase === "checkout" ? "Preparing" : "Analyzing"} ${id}\n`)
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
  } else {
    process.stdout.write(renderCorpusReport(run));
  }
  process.exitCode = run.summary.passed ? 0 : 1;
} catch (error) {
  process.stderr.write(`Kanon corpus error: ${error.message}\n`);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const options = {
    corpus: null,
    cache: null,
    fetch: true,
    json: false,
    repos: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--corpus") {
      options.corpus = requireValue(argv, ++index, arg);
    } else if (arg === "--cache") {
      options.cache = requireValue(argv, ++index, arg);
    } else if (arg === "--repo") {
      options.repos.push(requireValue(argv, ++index, arg));
    } else if (arg === "--no-fetch") {
      options.fetch = false;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function helpText() {
  return `Usage: npm run eval:corpus -- [options]

Options:
  --corpus <path>  Use another corpus manifest
  --cache <path>   Store pinned checkouts at this path
  --repo <id>      Evaluate one case (repeatable)
  --no-fetch       Require every pinned checkout to exist locally
  --json           Emit the complete machine-readable report
  -h, --help       Show this help
`;
}
