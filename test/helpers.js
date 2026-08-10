import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Writable } from "node:stream";
import { hardenedGitEnvironment } from "../src/git-runner.js";

export function canonicalRealpath(value) {
  return fs.realpathSync.native
    ? fs.realpathSync.native(value)
    : fs.realpathSync(value);
}

export function makeFixture(files = {}, prefix = "kanon-test-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const [relative, contents] of Object.entries(files)) {
    writeFixtureFile(root, relative, contents);
  }
  return canonicalRealpath(root);
}

export function writeFixtureFile(root, relative, contents) {
  const target = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return target;
}

export function runGitFixture(root, args, options = {}) {
  const { env: extraEnv = {}, ...spawnOptions } = options;
  const result = spawnSync("git", [
    "-c",
    "maintenance.auto=false",
    "-c",
    "gc.auto=0",
    "-C",
    root,
    ...args
  ], {
    encoding: "utf8",
    env: hardenedGitEnvironment(extraEnv),
    maxBuffer: 16 * 1024 * 1024,
    timeout: 20_000,
    windowsHide: true,
    ...spawnOptions
  });
  return result;
}

export function initializeGit(root, options = {}) {
  let result = runGitFixture(root, ["init"]);
  if (result.status !== 0) {
    return result;
  }
  if (options.commit !== false) {
    result = runGitFixture(root, ["add", "."]);
    if (result.status !== 0) {
      return result;
    }
    result = runGitFixture(root, [
      "-c",
      "user.name=Kanon Test",
      "-c",
      "user.email=kanon@example.invalid",
      "commit",
      "-m",
      options.subject || "fixture"
    ]);
  }
  return result;
}

export async function captureCli(runCli, argv, io = {}) {
  let output = "";
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    }
  });
  await runCli(argv, { ...io, stdout });
  return output;
}

export function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

export function fileIdentity(file) {
  const stat = fs.statSync(file, { bigint: true });
  return {
    sha256: sha256File(file),
    size: stat.size,
    mtimeNs: stat.mtimeNs
  };
}

export function executableScript(root, name, source) {
  const extension = process.platform === "win32" ? ".cmd" : "";
  const target = path.join(root, `${name}${extension}`);
  const contents = process.platform === "win32"
    ? source.windows
    : source.unix;
  fs.writeFileSync(target, contents, "utf8");
  if (process.platform !== "win32") {
    fs.chmodSync(target, 0o755);
  }
  return target;
}

export function canSymlink() {
  const root = makeFixture();
  const target = path.join(root, "target");
  const link = path.join(root, "link");
  fs.writeFileSync(target, "x");
  let available = false;
  try {
    fs.symlinkSync(target, link);
    available = true;
  } catch {
    available = false;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  return available;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
