/**
 * @typedef {{
 *   stdin?: import("node:stream").Readable & {isTTY?: boolean},
 *   stdout?: NodeJS.WritableStream
 * }} IoOptions
 * @typedef {{
 *   stdin: import("node:stream").Readable & {isTTY?: boolean},
 *   stdout: NodeJS.WritableStream
 * }} NormalizedIo
 */

/**
 * @param {IoOptions} [options]
 * @returns {NormalizedIo}
 */
export function normalizeIo(options = {}) {
  return {
    stdin: options.stdin || process.stdin,
    stdout: options.stdout || process.stdout
  };
}

/**
 * @param {NormalizedIo} io
 * @param {string} text
 * @returns {void}
 */
export function writeStdout(io, text) {
  io.stdout.write(text);
}

/**
 * @param {NormalizedIo} io
 * @returns {Promise<string>}
 */
export async function readStdin(io) {
  if (io.stdin.isTTY) {
    throw new Error("kanon todo add --stdin expects piped input.");
  }

  let text = "";
  io.stdin.setEncoding("utf8");
  for await (const chunk of io.stdin) {
    text += chunk;
  }
  return text;
}
