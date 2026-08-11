#!/usr/bin/env node

import { runWriteCli } from "../src/v1/compatibility/cli.js";

runWriteCli(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
