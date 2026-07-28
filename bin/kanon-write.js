#!/usr/bin/env node

import { runWriteCli } from "../src/cli/write.js";

runWriteCli(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
