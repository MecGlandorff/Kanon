export function normalizeIo(options) {
  return {
    stdin: options.stdin || process.stdin,
    stdout: options.stdout || process.stdout
  };
}

export function writeStdout(io, text) {
  io.stdout.write(text);
}

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
