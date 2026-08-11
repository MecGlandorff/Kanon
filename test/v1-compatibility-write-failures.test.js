import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runWriteCli } from "../src/cli/write.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import {
  inspectPreviousState,
  readKanonTodos
} from "../src/persist.js";
import {
  canSymlink,
  captureCli,
  fileIdentity,
  makeFixture,
  readJson
} from "./helpers.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const writeBin = path.join(repoRoot, "bin", "kanon-write.js");
const kanonGitignore = "*\n!.gitignore\n!KANON.md\n!TODO.md\n";

test("compatibility writes reject unsafe persistence targets without escaping", async (t) => {
  const rejectedRoot = makeFixture({
    "README.md": "# Rejected destination\n",
    ".kanon": "USER OWNED FILE\n"
  });
  const rejectedBefore = fileIdentity(path.join(rejectedRoot, ".kanon"));

  for (const argv of [
    ["todo", "add", "blocked", "--root", rejectedRoot],
    ["refresh", "--root", rejectedRoot]
  ]) {
    await assert.rejects(
      () => captureCli(runWriteCli, argv),
      /not a directory|rejected/i
    );
    assert.deepEqual(
      fileIdentity(path.join(rejectedRoot, ".kanon")),
      rejectedBefore
    );
  }

  if (!canSymlink()) {
    t.diagnostic("Symbolic links are unavailable; link subcases were skipped.");
    return;
  }

  const outside = makeFixture({
    "state.json": "OUTSIDE STATE MARKER\n",
    "todo.md": "OUTSIDE TODO MARKER\n"
  }, "kanon-write-outside-");
  const stateMarker = path.join(outside, "state.json");
  const todoMarker = path.join(outside, "todo.md");
  const stateBefore = fileIdentity(stateMarker);
  const todoBefore = fileIdentity(todoMarker);

  const refreshRoot = makeFixture({
    "README.md": "# Linked state destination\n",
    ".kanon/.gitignore": kanonGitignore
  });
  fs.symlinkSync(
    stateMarker,
    path.join(refreshRoot, ".kanon", "STATE.json"),
    "file"
  );
  await assert.rejects(
    () => captureCli(runWriteCli, ["refresh", "--root", refreshRoot]),
    /STATE\.json|symbolic link|reparse point/i
  );
  assert.deepEqual(fileIdentity(stateMarker), stateBefore);

  const todoRoot = makeFixture({
    "README.md": "# Linked todo destination\n",
    ".kanon/.gitignore": kanonGitignore
  });
  fs.symlinkSync(
    todoMarker,
    path.join(todoRoot, ".kanon", "TODO.md"),
    "file"
  );
  await assert.rejects(
    () => captureCli(runWriteCli, [
      "todo",
      "add",
      "blocked",
      "--root",
      todoRoot
    ]),
    /TODO\.md|symbolic link|reparse point/i
  );
  assert.deepEqual(fileIdentity(todoMarker), todoBefore);
  assert.equal(
    fs.readdirSync(path.join(todoRoot, ".kanon"))
      .some((name) => name.endsWith(".tmp")),
    false
  );
});

test("compatibility writes fail without replacing files on read-only media", async (t) => {
  if (
    process.platform === "win32" ||
    (typeof process.getuid === "function" && process.getuid() === 0)
  ) {
    t.skip("POSIX non-root permissions are required for this proof.");
    return;
  }

  const root = makeFixture({
    "README.md": "# Read-only destination\n",
    ".kanon/.gitignore": kanonGitignore,
    ".kanon/TODO.md": "# Kanon TODO\n\n- [ ] retained item\n"
  });
  const kanonDir = path.join(root, ".kanon");
  const todoPath = path.join(kanonDir, "TODO.md");
  const before = fileIdentity(todoPath);
  fs.chmodSync(kanonDir, 0o500);
  t.after(() => fs.chmodSync(kanonDir, 0o700));

  for (const argv of [
    ["todo", "add", "blocked", "--root", root],
    ["refresh", "--root", root]
  ]) {
    await assert.rejects(
      () => captureCli(runWriteCli, argv),
      /EACCES|EPERM|permission denied|read-only/i
    );
    assert.deepEqual(fileIdentity(todoPath), before);
  }
  assert.equal(fs.existsSync(path.join(kanonDir, "KANON.md")), false);
});

test("atomic TODO replacement rechecks a raced destination and fails closed", async (t) => {
  if (!canSymlink()) {
    t.skip("Symbolic links are unavailable.");
    return;
  }

  const root = makeFixture({
    "README.md": "# Replacement race\n",
    ".kanon/.gitignore": kanonGitignore,
    ".kanon/TODO.md": "# Kanon TODO\n\n- [ ] retained item\n"
  });
  const outside = makeFixture({
    "marker.md": "OUTSIDE RACE MARKER\n"
  }, "kanon-race-outside-");
  const todoPath = path.join(root, ".kanon", "TODO.md");
  const displacedPath = path.join(root, ".kanon", "TODO.displaced.md");
  const markerPath = path.join(outside, "marker.md");
  const markerBefore = fileIdentity(markerPath);
  const originalFsync = fs.fsyncSync;
  let injected = false;

  fs.fsyncSync = (fd) => {
    originalFsync(fd);
    if (!injected) {
      injected = true;
      fs.renameSync(todoPath, displacedPath);
      fs.symlinkSync(markerPath, todoPath, "file");
    }
  };
  try {
    await assert.rejects(
      () => captureCli(runWriteCli, [
        "todo",
        "add",
        "raced item",
        "--root",
        root
      ]),
      /symbolic link|reparse point|rejected/i
    );
  } finally {
    fs.fsyncSync = originalFsync;
  }

  assert.equal(injected, true);
  assert.deepEqual(fileIdentity(markerPath), markerBefore);
  assert.equal(
    fs.readFileSync(displacedPath, "utf8"),
    "# Kanon TODO\n\n- [ ] retained item\n"
  );
  assert.equal(
    fs.readdirSync(path.join(root, ".kanon"))
      .some((name) => name.endsWith(".tmp")),
    false
  );
});

test("refresh warns on malformed and bounded prior state before replacing it", async () => {
  const cases = [
    {
      name: "malformed",
      state: "{not-json}\n",
      warning: /not valid JSON/
    },
    {
      name: "over-budget",
      state: " ".repeat(1_025),
      warning: /budget-exceeded|1024-byte limit/,
      config: configWithInputLimits({ max_state_bytes: 1_024 })
    }
  ];

  for (const fixture of cases) {
    const files = {
      "README.md": `# ${fixture.name} prior state\n`,
      ".kanon/STATE.json": fixture.state
    };
    if (fixture.config) {
      files[".kanon/config.json"] = `${JSON.stringify(fixture.config)}\n`;
    }
    const root = makeFixture(files);
    const configBefore = fixture.config
      ? fs.readFileSync(path.join(root, ".kanon", "config.json"), "utf8")
      : null;
    const output = await captureCli(runWriteCli, [
      "refresh",
      "--root",
      root
    ]);
    const inspection = inspectPreviousState(root);

    assert.match(output, /Warning: STATE\.json was ignored/);
    assert.match(output, fixture.warning);
    assert.ok(Buffer.byteLength(output) < 64 * 1024);
    assert.equal(inspection.valid, true);
    assert.equal(inspection.state?.schema_version, 2);
    assert.equal(fs.existsSync(path.join(root, ".kanon", "TODO.md")), false);
    if (configBefore !== null) {
      assert.equal(
        fs.readFileSync(path.join(root, ".kanon", "config.json"), "utf8"),
        configBefore
      );
    }
  }
});

test("TODO mutation rejects an over-budget existing store without replacement", async () => {
  const config = configWithInputLimits({ max_todo_bytes: 1_024 });
  const root = makeFixture({
    "README.md": "# Bounded TODO store\n",
    ".kanon/config.json": `${JSON.stringify(config)}\n`,
    ".kanon/TODO.md": `# Kanon TODO\n\n- [ ] ${"x".repeat(1_024)}\n`
  });
  const todoPath = path.join(root, ".kanon", "TODO.md");
  const before = fileIdentity(todoPath);

  await assert.rejects(
    () => captureCli(runWriteCli, [
      "todo",
      "add",
      "blocked",
      "--root",
      root
    ]),
    /budget-exceeded|1024-byte limit/i
  );
  assert.deepEqual(fileIdentity(todoPath), before);
});

test("concurrent compatibility writers leave complete bounded artifacts", async () => {
  const root = makeFixture({
    "README.md": "# Concurrent writers\n",
    "package.json": JSON.stringify({ name: "concurrent-writers" }),
    ".kanon/.gitignore": kanonGitignore,
    ".kanon/config.json": `${JSON.stringify(DEFAULT_CONFIG)}\n`,
    ".kanon/TODO.md": "# Kanon TODO\n\n"
  });
  fs.mkdirSync(path.join(root, ".kanon", "snapshots"));
  const todoTexts = Array.from(
    { length: 6 },
    (_, index) => `concurrent item ${index + 1}`
  );
  const jobs = [
    ...todoTexts.map((text) => ({
      kind: "todo",
      run: spawnWrite([
        "todo",
        "add",
        text,
        "--json",
        "--root",
        root
      ])
    })),
    ...Array.from({ length: 2 }, () => ({
      kind: "refresh",
      run: spawnWrite(["refresh", "--root", root])
    }))
  ];
  const results = await Promise.all(
    jobs.map(async (job) => ({ ...job, result: await job.run }))
  );

  for (const { kind, result } of results) {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, "");
    if (kind === "todo") {
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.path, ".kanon/TODO.md");
      assert.ok(todoTexts.includes(parsed.todo.text));
    } else {
      assert.match(result.stdout, /^Kanon refreshed /);
    }
  }

  const todoSource = fs.readFileSync(
    path.join(root, ".kanon", "TODO.md"),
    "utf8"
  );
  const todos = readKanonTodos(root);
  assert.match(todoSource, /^# Kanon TODO\n\n/);
  assert.equal(todoSource.endsWith("\n"), true);
  assert.ok(todos.length >= 1 && todos.length <= todoTexts.length);
  assert.ok(todos.every((todo) => todoTexts.includes(todo.text)));

  const state = inspectPreviousState(root);
  assert.equal(state.valid, true);
  assert.equal(state.state?.schema_version, 2);
  const evidenceLines = fs
    .readFileSync(path.join(root, ".kanon", "EVIDENCE.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  assert.ok(evidenceLines.length > 0);
  for (const line of evidenceLines) {
    assert.doesNotThrow(() => JSON.parse(line));
  }
  for (const directory of [
    path.join(root, ".kanon"),
    path.join(root, ".kanon", "snapshots")
  ]) {
    assert.equal(
      fs.readdirSync(directory).some((name) => name.endsWith(".tmp")),
      false
    );
  }
  for (const snapshot of fs.readdirSync(path.join(root, ".kanon", "snapshots"))) {
    assert.doesNotThrow(() => readJson(
      path.join(root, ".kanon", "snapshots", snapshot)
    ));
  }
});

function configWithInputLimits(inputLimits) {
  return {
    ...DEFAULT_CONFIG,
    inputs: {
      ...DEFAULT_CONFIG.inputs,
      ...inputLimits
    }
  };
}

function spawnWrite(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [writeBin, ...args], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Compatibility writer exceeded its 30-second test bound."));
    }, 30_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });
}
