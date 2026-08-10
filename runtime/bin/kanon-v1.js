#!/usr/bin/env node

import { runStableCli } from "../cli.js";

/**
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function main(argv) {
  await runStableCli(argv);
}

main(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error
    ? error.message
    : "Kanon stable skill invocation failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
