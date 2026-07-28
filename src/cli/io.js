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
 * @param {number} maximumBytes
 * @returns {Promise<string>}
 */
export async function readStdin(io, maximumBytes) {
  if (
    io.stdin.isTTY ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > 1024 * 1024
  ) {
    throw new Error("kanon todo add --stdin expects piped input.");
  }

  let text = "";
  let bytes = 0;
  io.stdin.setEncoding("utf8");
  for await (const chunk of io.stdin) {
    const selected = String(chunk);
    bytes += Buffer.byteLength(selected, "utf8");
    if (bytes > maximumBytes) {
      throw new Error(
        `kanon todo add --stdin exceeded ${maximumBytes} bytes.`
      );
    }
    text += selected;
  }
  return text;
}
