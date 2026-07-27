import { inspectHook } from "./probe-core.mjs";

try {
  const input = JSON.parse(await readStdin());
  const { output } = inspectHook(input);
  if (output) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
} catch (error) {
  const code = typeof error?.code === "string" ? error.code : "error";
  process.stderr.write(
    `Kanon Guard feasibility hook failed (${code}).\n`
  );
  process.exitCode = 1;
}

async function readStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 128 * 1024) {
      throw new Error("Hook input exceeds 128 KiB.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
