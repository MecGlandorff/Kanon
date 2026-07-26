import fs from "node:fs";
import path from "node:path";

export function npmInvocation(args) {
  return {
    command: process.execPath,
    args: [resolveNpmCli(), ...args]
  };
}

export function resolveNpmCli() {
  const executableDirectory = path.dirname(process.execPath);
  const candidates = [
    path.join(
      executableDirectory,
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    ),
    path.join(
      executableDirectory,
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    ),
    path.join(
      executableDirectory,
      "..",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    )
  ];
  const rejectedRoot = fs.realpathSync(process.cwd());
  const launcherNames = process.platform === "win32"
    ? ["npm.cmd", "npm.exe", "npm"]
    : ["npm"];
  for (const entry of String(process.env.PATH || "").split(path.delimiter)) {
    const directory = path.resolve(entry || process.cwd());
    for (const launcherName of launcherNames) {
      const launcher = path.join(directory, launcherName);
      try {
        const canonicalLauncher = fs.realpathSync(launcher);
        if (isWithin(rejectedRoot, canonicalLauncher)) {
          continue;
        }
        if (path.basename(canonicalLauncher) === "npm-cli.js") {
          candidates.push(canonicalLauncher);
        }
        candidates.push(
          path.join(
            directory,
            "node_modules",
            "npm",
            "bin",
            "npm-cli.js"
          )
        );
      } catch {
        // This PATH entry does not provide npm.
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const canonical = fs.realpathSync(candidate);
      if (fs.statSync(canonical).isFile()) {
        return canonical;
      }
    } catch {
      // Try the next location within the active Node installation.
    }
  }
  throw new Error(
    `Unable to locate npm-cli.js beside the active Node executable: ${process.execPath}`
  );
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    )
  );
}
