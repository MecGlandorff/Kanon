import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { analyzeRepo, readPreviousState, renderAsk, renderVerify, writeKanonOutputs } from "../src/index.js";
import { runCli } from "../src/cli.js";
import { extractCommandsFromMarkdown } from "../src/verify.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("verify detects README npm script drift", () => {
  const root = makeFixture({
    "README.md": "# Demo\n\nRun `npm start`.\n",
    "package.json": JSON.stringify({
      name: "demo",
      scripts: {
        test: "node --test",
        dev: "node src/index.js"
      }
    }),
    "src/index.js": "console.log('demo')\n"
  });

  const analysis = analyzeRepo(root, { runId: "20260525000100" });
  assert.equal(analysis.state.verification.issues.length, 1);
  assert.match(analysis.state.verification.issues[0].observation, /no `start` script/);
  assert.match(renderVerify(analysis), /README \/ repo drift/);
});

test("brief detects Python pytest evidence and CI unknown", () => {
  const root = makeFixture({
    "README.md": "# News Digest\n",
    "pyproject.toml": "[project]\nname = \"news\"\ndescription = \"Local news digest\"\n\n[tool.pytest.ini_options]\ntestpaths = [\"tests\"]\n",
    "src/run.py": "def main():\n    pass\n",
    "tests/test_run.py": "def test_ok():\n    assert True\n"
  });

  const analysis = analyzeRepo(root, { runId: "20260525000200" });
  assert.deepEqual(analysis.state.repo.languages, ["Python"]);
  assert.equal(analysis.state.commands.test[0].command, "pytest");
  assert.ok(analysis.state.current_state.unknown.some((item) => item.claim === "No CI configuration found."));
  assert.ok(analysis.state.current_state.likely.some((item) => item.claim.includes("src/run.py")));
});

test("refresh writes Kanon continuity files and keeps machine files ignored", () => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    "package.json": JSON.stringify({
      name: "demo",
      description: "Demo repo",
      scripts: {
        test: "node --test"
      }
    }),
    "test/demo.test.js": "import test from 'node:test';\n"
  });

  const analysis = analyzeRepo(root, { runId: "20260525000300" });
  const result = writeKanonOutputs(analysis);

  assert.ok(fs.existsSync(path.join(root, ".kanon", "KANON.md")));
  assert.ok(fs.existsSync(path.join(root, ".kanon", "STATE.json")));
  assert.ok(fs.existsSync(path.join(root, ".kanon", "EVIDENCE.jsonl")));
  assert.equal(fs.readFileSync(path.join(root, ".kanon", ".gitignore"), "utf8"), "*\n!.gitignore\n!KANON.md\n");
  assert.equal(readPreviousState(root).repo.name, "demo");
  assert.ok(result.written.includes(".kanon/KANON.md"));
});

test("CLI supports top-level version flag", async () => {
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    output += chunk;
    return true;
  };

  try {
    await runCli(["--version"]);
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.equal(output, "0.1.0\n");
});

test("skill artifact keeps line-separated metadata and executable wrappers", () => {
  const skill = fs.readFileSync(path.join(repoRoot, "skills/kanon/SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: kanon\ndescription: "[^"]+"\n---\n\n# Kanon\n/);
  assert.match(skill, /\n## Runtime Contract\n/);

  const agentYaml = fs.readFileSync(path.join(repoRoot, "skills/kanon/agents/openai.yaml"), "utf8");
  assert.match(
    agentYaml,
    /^interface:\n  display_name: "Kanon"\n  short_description: "Evidence-backed repo continuity"\n  default_prompt: ".+"\n$/
  );

  for (const scriptName of ["kanon-ask", "kanon-brief", "kanon-resume", "kanon-verify"]) {
    const scriptPath = path.join(repoRoot, "skills/kanon/scripts", scriptName);
    const script = fs.readFileSync(scriptPath, "utf8");
    assert.match(script, /^#!\/usr\/bin\/env bash\nset -euo pipefail\n\nCOMMAND="/);
    assert.match(script, /\nLOCAL_KANON="\$SCRIPT_DIR\/\.\.\/\.\.\/\.\.\/bin\/kanon\.js"\n/);
    assert.match(script, /Kanon CLI not found/);
    assert.notEqual(fs.statSync(scriptPath).mode & 0o111, 0);
  }
});

test("skill wrapper fails clearly when Kanon CLI is unavailable", () => {
  const { root, target } = copyStandaloneSkillScript("kanon-brief");
  const result = spawnSync(target, [], {
    cwd: root,
    env: { ...process.env, PATH: "/usr/bin:/bin" },
    encoding: "utf8"
  });

  assert.equal(result.status, 127);
  assert.match(result.stderr, /Kanon CLI not found/);
  assert.match(result.stderr, /npm install -g @mecglandorff\/kanon/);
});

test("skill wrapper invokes PATH Kanon CLI with the expected command", () => {
  const { root, target } = copyStandaloneSkillScript("kanon-brief");
  const binDir = path.join(root, "fake-bin");
  const markerPath = path.join(root, "args.txt");
  fs.mkdirSync(binDir, { recursive: true });
  const fakeKanon = path.join(binDir, "kanon");
  fs.writeFileSync(fakeKanon, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${markerPath}"\n`, "utf8");
  fs.chmodSync(fakeKanon, 0o755);

  const result = spawnSync(target, ["--json"], {
    cwd: root,
    env: { ...process.env, PATH: `${binDir}:/usr/bin:/bin` },
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(markerPath, "utf8"), "brief\n--json\n");
});

test("README command extraction ignores markdown blockquotes", () => {
  const commands = extractCommandsFromMarkdown("> I just opened this repo.\n\n```bash\n$ npm test\nkanon brief\n```\n");
  assert.deepEqual(commands, ["npm test", "kanon brief"]);
});

test("README command extraction ignores inline paths", () => {
  const commands = extractCommandsFromMarkdown("State lives in `.kanon/` and the skill is in `skills/kanon/`.");
  assert.deepEqual(commands, []);
});

test("ask next-step questions returns suggested work", () => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    "package.json": JSON.stringify({
      name: "demo",
      scripts: {
        test: "node --test"
      }
    }),
    "src/index.js": "// TODO: wire CLI\n"
  });
  const answer = renderAsk(analyzeRepo(root, { runId: "20260525000400" }), "what should I do next?");
  assert.match(answer, /### Suggested/);
  assert.match(answer, /Run npm test first/);
});

test("ask stale questions returns drift bucket", () => {
  const root = makeFixture({
    "README.md": "# Demo\n\nRun `npm start`.\n",
    "package.json": JSON.stringify({
      name: "demo",
      scripts: {
        test: "node --test"
      }
    })
  });
  const answer = renderAsk(analyzeRepo(root, { runId: "20260525000500" }), "what is stale?");
  assert.match(answer, /### Stale \/ Suspicious/);
  assert.match(answer, /README says to run `npm start`/);
});

function makeFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-test-"));
  for (const [relPath, contents] of Object.entries(files)) {
    const abs = path.join(root, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents, "utf8");
  }
  return root;
}

function copyStandaloneSkillScript(scriptName) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-skill-"));
  const scriptDir = path.join(root, "skills", "kanon", "scripts");
  fs.mkdirSync(scriptDir, { recursive: true });
  const source = path.join(repoRoot, "skills", "kanon", "scripts", scriptName);
  const target = path.join(scriptDir, scriptName);
  fs.copyFileSync(source, target);
  fs.chmodSync(target, 0o755);
  return { root, target };
}
