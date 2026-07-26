import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  addKanonTodo,
  analyzeRepo,
  buildImprovements,
  buildRefactorPlan,
  completeKanonTodo,
  readKanonTodos,
  readPreviousState,
  renderAsk,
  renderImprove,
  renderRefactor,
  renderResume,
  renderVerify,
  writeKanonImproveOutput,
  writeKanonRefactorOutput,
  writeKanonOutputs
} from "../src/index.js";
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
  assert.equal(
    fs.readFileSync(path.join(root, ".kanon", ".gitignore"), "utf8"),
    "*\n!.gitignore\n!KANON.md\n!TODO.md\n!IMPROVEMENTS.md\n!REFACTOR_PLAN.md\n"
  );
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

  assert.equal(output, "0.3.0\n");
});

test("README presents Kanon as an agent skill, not a terminal package", () => {
  const readme = readText(path.join(repoRoot, "README.md"));

  assert.match(readme, /Use Kanon inside an agent session/);
  assert.match(readme, /\$kanon/);
  assert.doesNotMatch(readme, /\bnpx\b/);
  assert.doesNotMatch(readme, /npm install -g/);
  assert.doesNotMatch(readme, /^## Commands$/m);
});

test("package metadata does not expose a terminal binary", () => {
  const pkg = JSON.parse(readText(path.join(repoRoot, "package.json")));

  assert.equal(pkg.bin, undefined);
  assert.equal(pkg.scripts.kanon, undefined);
});

test("skill artifact keeps line-separated metadata and executable wrappers", () => {
  const skill = readText(path.join(repoRoot, "skills/kanon/SKILL.md"));
  assert.match(skill, /^---\nname: kanon\ndescription: "[^"]+"\n---\n\n# Kanon\n/);
  assert.match(skill, /\n## Mental Model\n/);
  assert.match(skill, /Run wrappers with the target repo as the command working directory/);
  assert.match(skill, /Resolve wrapper paths relative to this skill directory/);
  assert.match(skill, /\n## Runtime Contract\n/);
  assert.match(skill, /not a standalone terminal interface/);
  assert.match(skill, /must not fall back to a globally installed `kanon` command/);
  assert.doesNotMatch(skill, /npm install -g/);

  const agentYaml = readText(path.join(repoRoot, "skills/kanon/agents/openai.yaml"));
  assert.match(
    agentYaml,
    /^interface:\n  display_name: "Kanon"\n  short_description: "Evidence-backed repo continuity"\n  default_prompt: ".+"\n$/
  );

  const skillWrappers = [
    ["kanon-ask", "ask"],
    ["kanon-brief", "brief"],
    ["kanon-improve", "improve"],
    ["kanon-refactor", "refactor"],
    ["kanon-refresh", "refresh"],
    ["kanon-resume", "resume"],
    ["kanon-todo", "todo"],
    ["kanon-verify", "verify"]
  ];

  for (const [scriptName, command] of skillWrappers) {
    const scriptPath = path.join(repoRoot, "skills/kanon/scripts", scriptName);
    const script = readText(scriptPath);
    assert.match(script, /^#!\/usr\/bin\/env bash\nset -euo pipefail\n\nCOMMAND="/);
    assert.match(script, new RegExp(`\\nCOMMAND="${command}"\\n`));
    assert.match(script, /\nLOCAL_KANON="\$SCRIPT_DIR\/\.\.\/runtime\/bin\/kanon\.js"\n/);
    assert.match(script, /Kanon skill runtime is incomplete/);
    assert.match(script, /self-contained Kanon skill/);
    assert.doesNotMatch(script, /command -v kanon/);
    assert.doesNotMatch(script, /npm install -g/);
    if (process.platform !== "win32") {
      assert.notEqual(fs.statSync(scriptPath).mode & 0o111, 0);
    }
  }

  for (const [scriptName, command] of skillWrappers) {
    const scriptPath = path.join(repoRoot, "skills/kanon/scripts", `${scriptName}.ps1`);
    const script = readText(scriptPath);
    assert.ok(script.includes(`$KanonCommand = "${command}"`));
    assert.ok(script.includes('$LocalKanon = Join-Path $PSScriptRoot "../runtime/bin/kanon.js"'));
    assert.match(script, /Get-Command node/);
    assert.doesNotMatch(script, /Get-Command kanon/);
    assert.match(script, /Kanon skill runtime is incomplete/);
    assert.match(script, /self-contained Kanon skill/);
    assert.doesNotMatch(script, /npm install -g/);
  }
});

test("skill wrapper invokes the bundled local runtime in the package checkout", (t) => {
  if (process.platform === "win32") {
    t.skip("Bash wrapper execution is covered on Unix CI.");
    return;
  }

  const target = path.join(repoRoot, "skills", "kanon", "scripts", "kanon-brief");
  const result = spawnSync(target, ["--json"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.repo.name, "@mecglandorff/kanon");
});

test("skill wrapper fails clearly when the bundled runtime is unavailable", (t) => {
  if (process.platform === "win32") {
    t.skip("Bash wrapper execution is covered on Unix CI.");
    return;
  }

  const { root, target } = copyStandaloneSkillScript("kanon-brief");
  const result = spawnSync(target, [], {
    cwd: root,
    env: { ...process.env, PATH: "/usr/bin:/bin" },
    encoding: "utf8"
  });

  assert.equal(result.status, 127);
  assert.match(result.stderr, /Kanon skill runtime is incomplete/);
  assert.match(result.stderr, /self-contained Kanon skill/);
  assert.doesNotMatch(result.stderr, /npm install -g/);
});

test("skill wrapper does not fall back to PATH Kanon CLI", (t) => {
  if (process.platform === "win32") {
    t.skip("Bash wrapper execution is covered on Unix CI.");
    return;
  }

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

  assert.equal(result.status, 127);
  assert.equal(fs.existsSync(markerPath), false);
  assert.match(result.stderr, /Kanon skill runtime is incomplete/);
});

test("PowerShell skill wrapper does not fall back to PATH Kanon CLI", (t) => {
  const pwsh = findPowerShell();
  if (!pwsh) {
    t.skip("pwsh not available.");
    return;
  }

  const { root, target } = copyStandalonePowerShellSkillScript("kanon-brief.ps1");
  const binDir = path.join(root, "fake-bin");
  const markerPath = path.join(root, "args.txt");
  fs.mkdirSync(binDir, { recursive: true });
  writeFakeKanonCommand(binDir, markerPath);

  const args = ["-NoProfile"];
  if (process.platform === "win32") {
    args.push("-ExecutionPolicy", "Bypass");
  }
  args.push("-File", target, "--json");

  const result = spawnSync(pwsh, args, {
    cwd: root,
    env: withPrependedPath(process.env, binDir),
    encoding: "utf8"
  });

  assert.equal(result.status, 127);
  assert.equal(fs.existsSync(markerPath), false);
  assert.match(result.stderr, /Kanon skill runtime is incomplete/);
});

test("PowerShell skill wrapper invokes the self-contained runtime", (t) => {
  const pwsh = findPowerShell();
  if (!pwsh) {
    t.skip("PowerShell is not available.");
    return;
  }

  const target = path.join(repoRoot, "skills", "kanon", "scripts", "kanon-brief.ps1");
  const args = ["-NoProfile"];
  if (process.platform === "win32") {
    args.push("-ExecutionPolicy", "Bypass");
  }
  args.push("-File", target, "--json");
  const result = spawnSync(pwsh, args, {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).repo.name, "@mecglandorff/kanon");
});

test("Kanon todos are human-owned and included in resume output", () => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    "package.json": JSON.stringify({
      name: "demo",
      description: "Demo repo",
      scripts: {
        test: "node --test"
      }
    })
  });

  const added = addKanonTodo(root, "Add README quickstart\n\nInclude brief, verify, ask, and refresh.");
  assert.equal(added.path, ".kanon/TODO.md");
  assert.equal(added.todo.number, 1);
  assert.equal(added.todo.text, "Add README quickstart");
  assert.deepEqual(added.todo.details, ["Include brief, verify, ask, and refresh."]);
  assert.equal(
    fs.readFileSync(path.join(root, ".kanon", ".gitignore"), "utf8"),
    "*\n!.gitignore\n!KANON.md\n!TODO.md\n!IMPROVEMENTS.md\n!REFACTOR_PLAN.md\n"
  );

  const analysis = analyzeRepo(root, { runId: "20260525000600" });
  const resume = renderResume(analysis, null, { todos: readKanonTodos(root) });
  assert.match(resume, /## Open Kanon Todos/);
  assert.match(resume, /1\. Add README quickstart/);

  const completed = completeKanonTodo(root, 1);
  assert.equal(completed.changed, true);
  assert.equal(readKanonTodos(root)[0].done, true);
});

test("CLI todo commands add, list, and complete follow-up work", async () => {
  const root = makeFixture({
    "README.md": "# Demo\n"
  });

  const addOutput = await captureRunCli(["todo", "add", "Review README quickstart", "--root", root]);
  assert.equal(addOutput, "Added Kanon todo #1: Review README quickstart\n");

  const listOutput = await captureRunCli(["todo", "list", "--root", root]);
  assert.match(listOutput, /# Kanon Todos/);
  assert.match(listOutput, /1\. \[ \] Review README quickstart/);

  const doneOutput = await captureRunCli(["todo", "done", "1", "--root", root]);
  assert.equal(doneOutput, "Completed Kanon todo #1: Review README quickstart\n");

  const openOutput = await captureRunCli(["todo", "list", "--root", root]);
  assert.match(openOutput, /No open Kanon todos/);

  const allOutput = await captureRunCli(["todo", "list", "--all", "--root", root]);
  assert.match(allOutput, /1\. \[x\] Review README quickstart/);
});

test("improve builds deterministic recommendations and report modes", async () => {
  const root = makeFixture({
    "README.md": "# Demo\n\nRun `npm start`.\n",
    "package.json": JSON.stringify({
      name: "demo",
      description: "Demo repo",
      scripts: {
        test: "node --test"
      }
    }),
    "src/index.js": "// TODO: improve CLI coverage\n",
    "test/demo.test.js": "import test from 'node:test';\n"
  });

  const analysis = analyzeRepo(root, { runId: "20260525000700" });
  const improvements = buildImprovements(analysis);
  assert.ok(improvements.recommendations.some((item) => item.id === "docs.drift"));
  assert.ok(improvements.recommendations.some((item) => item.category === "ci"));
  assert.equal(improvements.scorecard.length, 6);

  const top = renderImprove(improvements, { mode: "top" });
  assert.match(top, /Mode: top/);
  assert.match(top, /## Top Recommendations/);
  assert.match(top, /Resolve README drift/);

  const audit = renderImprove(improvements, { mode: "audit" });
  assert.match(audit, /Mode: audit/);
  assert.match(audit, /## Project Health/);
  assert.match(audit, /### Docs/);

  const scorecard = renderImprove(improvements, { mode: "scorecard" });
  assert.match(scorecard, /Mode: scorecard/);
  assert.match(scorecard, /## Scorecard/);
  assert.doesNotMatch(scorecard, /## Top Recommendations/);
});

test("CLI improve supports explicit modes, JSON, non-interactive default, and write", async () => {
  const root = makeFixture({
    "README.md": "# Demo\n\nRun `npm start`.\n",
    "package.json": JSON.stringify({
      name: "demo",
      description: "Demo repo",
      scripts: {
        test: "node --test"
      }
    }),
    "test/demo.test.js": "import test from 'node:test';\n"
  });

  const topOutput = await captureRunCli(["improve", "--mode", "top", "--root", root]);
  assert.match(topOutput, /Mode: top/);

  const auditOutput = await captureRunCli(["improve", "--mode=audit", "--root", root]);
  assert.match(auditOutput, /Mode: audit/);

  const scorecardOutput = await captureRunCli(["improve", "--mode", "scorecard", "--root", root]);
  assert.match(scorecardOutput, /Mode: scorecard/);

  const defaultOutput = await captureRunCli(["improve", "--root", root]);
  assert.match(defaultOutput, /Mode: top/);

  const jsonOutput = await captureRunCli(["improve", "--mode", "top", "--json", "--root", root]);
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.mode, "top");
  assert.ok(parsed.improvements.recommendations.length > 0);
  assert.deepEqual(parsed.state.improvements, parsed.improvements);

  const writeOutput = await captureRunCli(["improve", "--mode", "audit", "--write", "--root", root]);
  assert.match(writeOutput, /Wrote Kanon improvements/);
  assert.ok(fs.existsSync(path.join(root, ".kanon", "IMPROVEMENTS.md")));
  assert.match(fs.readFileSync(path.join(root, ".kanon", "IMPROVEMENTS.md"), "utf8"), /Mode: audit/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, ".kanon", "STATE.json"), "utf8")).improvements);
  assert.equal(
    fs.readFileSync(path.join(root, ".kanon", ".gitignore"), "utf8"),
    "*\n!.gitignore\n!KANON.md\n!TODO.md\n!IMPROVEMENTS.md\n!REFACTOR_PLAN.md\n"
  );
});

test("refactor builds code-evidence hotspots, plan, audit, and prompt modes", () => {
  const longFunction = Array.from({ length: 120 }, (_, index) => `  if value == ${index}:\n    return ${index}`).join("\n");
  const root = makeFixture({
    "README.md": "# Demo\n",
    "package.json": JSON.stringify({
      name: "demo",
      description: "Demo repo",
      scripts: {
        test: "node --test"
      }
    }),
    "src/messy.py": `def processData(value):\n${longFunction}\n  return None\n`,
    "src/unused_feature.py": "def unused_feature():\n    return 'unused'\n",
    "test/demo.test.js": "import test from 'node:test';\n"
  });

  const analysis = analyzeRepo(root, { runId: "20260525000900" });
  const refactor = buildRefactorPlan(analysis, {
    agent: "codex",
    answers: {
      goal: "Make the Python code plain and readable."
    }
  });

  assert.equal(refactor.agent, "codex");
  assert.ok(refactor.hotspots.some((item) => item.target === "src/messy.py"));
  assert.ok(refactor.hotspots.some((item) => item.type === "dead-code-candidate"));
  assert.match(refactor.agent_prompt, /You are Codex/);
  assert.match(refactor.agent_prompt, /Before editing/);

  const plan = renderRefactor(refactor, { mode: "plan" });
  assert.match(plan, /# Kanon Refactor Plan/);
  assert.match(plan, /Mode: plan/);
  assert.match(plan, /## One-Session Plan/);
  assert.match(plan, /## Agent Prompt/);

  const audit = renderRefactor(refactor, { mode: "audit" });
  assert.match(audit, /Mode: audit/);
  assert.match(audit, /## Hotspots/);
  assert.match(audit, /src\/messy\.py/);

  const prompt = renderRefactor(refactor, { mode: "prompt" });
  assert.match(prompt, /# Kanon Refactor Prompt/);
  assert.doesNotMatch(prompt, /## Hotspots/);
  assert.match(prompt, /Do not start broad rewrites/);
});

test("CLI refactor supports modes, agents, JSON, non-interactive defaults, and write", async () => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    "package.json": JSON.stringify({
      name: "demo",
      description: "Demo repo",
      scripts: {
        test: "node --test"
      }
    }),
    "src/large.js": `export function run(value) {\n${Array.from({ length: 140 }, (_, index) => `  if (value === ${index}) return ${index};`).join("\n")}\n  return null;\n}\n`,
    "test/demo.test.js": "import test from 'node:test';\n"
  });

  const planOutput = await captureRunCli(["refactor", "--mode", "plan", "--agent", "codex", "--root", root]);
  assert.match(planOutput, /Mode: plan/);
  assert.match(planOutput, /You are Codex/);

  const auditOutput = await captureRunCli(["refactor", "--mode=audit", "--root", root]);
  assert.match(auditOutput, /Mode: audit/);
  assert.match(auditOutput, /## Hotspots/);

  const promptOutput = await captureRunCli(["refactor", "--mode", "prompt", "--agent", "claude", "--root", root]);
  assert.match(promptOutput, /Mode: prompt/);
  assert.match(promptOutput, /You are Claude Code/);

  const defaultOutput = await captureRunCli(["refactor", "--root", root]);
  assert.match(defaultOutput, /Mode: plan/);

  const jsonOutput = await captureRunCli(["refactor", "--mode", "plan", "--json", "--root", root]);
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.mode, "plan");
  assert.equal(parsed.agent, "generic");
  assert.ok(parsed.refactor.hotspots.length > 0);
  assert.deepEqual(parsed.state.refactor, parsed.refactor);

  const writeOutput = await captureRunCli(["refactor", "--mode", "prompt", "--write", "--root", root]);
  assert.match(writeOutput, /Wrote Kanon refactor plan/);
  assert.ok(fs.existsSync(path.join(root, ".kanon", "REFACTOR_PLAN.md")));
  assert.match(fs.readFileSync(path.join(root, ".kanon", "REFACTOR_PLAN.md"), "utf8"), /Mode: prompt/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, ".kanon", "STATE.json"), "utf8")).refactor);
  assert.equal(
    fs.readFileSync(path.join(root, ".kanon", ".gitignore"), "utf8"),
    "*\n!.gitignore\n!KANON.md\n!TODO.md\n!IMPROVEMENTS.md\n!REFACTOR_PLAN.md\n"
  );
});

test("CLI refactor asks steering questions in interactive mode", async () => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    "package.json": JSON.stringify({
      name: "demo",
      description: "Demo repo",
      scripts: {
        test: "node --test"
      }
    }),
    "src/main.js": "export function main() { return true; }\n"
  });

  const stdin = makeInteractiveStdin("Readable Python style\nCLI must not break\nAsk me first\nYes\nOne session\n");
  const stdout = makeCaptureStdout({ isTTY: true });
  await runCli(["refactor", "--mode", "plan", "--root", root], { stdin, stdout });
  const output = stdout.readOutput();

  assert.match(output, /What is the main refactor goal\?/);
  assert.match(output, /Readable Python style/);
  assert.match(output, /CLI must not break/);
  assert.match(output, /Ask me first/);
});

test("writeKanonRefactorOutput persists only the refactor plan", () => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    "package.json": JSON.stringify({
      name: "demo",
      description: "Demo repo",
      scripts: {
        test: "node --test"
      }
    }),
    "src/main.js": "export function main() { return true; }\n"
  });

  const analysis = analyzeRepo(root, { runId: "20260525001000" });
  const refactor = buildRefactorPlan(analysis, { agent: "claude" });
  const result = writeKanonRefactorOutput(analysis, refactor, { mode: "audit" });

  assert.deepEqual(result.written, [".kanon/.gitignore", ".kanon/REFACTOR_PLAN.md", ".kanon/STATE.json"]);
  assert.match(fs.readFileSync(path.join(root, ".kanon", "REFACTOR_PLAN.md"), "utf8"), /Mode: audit/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, ".kanon", "STATE.json"), "utf8")).refactor);
  assert.equal(fs.existsSync(path.join(root, ".kanon", "IMPROVEMENTS.md")), false);
});

test("CLI improve prompts for report choices 1, 2, and 3 in interactive mode", async () => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    "package.json": JSON.stringify({
      name: "demo",
      description: "Demo repo",
      scripts: {
        test: "node --test"
      }
    })
  });

  for (const [choice, mode] of [["1", "top"], ["2", "audit"], ["3", "scorecard"]]) {
    const stdin = makeInteractiveStdin(`${choice}\n`);
    const stdout = makeCaptureStdout({ isTTY: true });
    await runCli(["improve", "--root", root], { stdin, stdout });
    const output = stdout.readOutput();
    assert.match(output, /Choose improvement report: 1\) Top 5/);
    assert.match(output, new RegExp(`Mode: ${mode}`));
  }
});

test("writeKanonImproveOutput persists only improvement direction files", () => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    "package.json": JSON.stringify({
      name: "demo",
      description: "Demo repo",
      scripts: {
        test: "node --test"
      }
    })
  });

  const analysis = analyzeRepo(root, { runId: "20260525000800" });
  const improvements = buildImprovements(analysis);
  const result = writeKanonImproveOutput(analysis, improvements, { mode: "scorecard" });

  assert.deepEqual(result.written, [".kanon/.gitignore", ".kanon/IMPROVEMENTS.md", ".kanon/STATE.json"]);
  assert.match(fs.readFileSync(path.join(root, ".kanon", "IMPROVEMENTS.md"), "utf8"), /Mode: scorecard/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, ".kanon", "STATE.json"), "utf8")).improvements);
  assert.equal(fs.existsSync(path.join(root, ".kanon", "KANON.md")), false);
});
test("README command extraction ignores markdown blockquotes", () => {
  const commands = extractCommandsFromMarkdown("> I just opened this repo.\n\n```bash\n$ npm test\nkanon brief\n```\n");
  assert.deepEqual(commands, ["npm test", "kanon brief"]);
});

test("README command extraction ignores inline paths", () => {
  const commands = extractCommandsFromMarkdown(
    "State lives in `.kanon/` and the skill is in `skills/kanon/`.\n\n```text\nKANON.md        human-readable repo continuity\n```\n"
  );
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

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
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

function copyStandalonePowerShellSkillScript(scriptName) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-skill-"));
  const scriptDir = path.join(root, "skills", "kanon", "scripts");
  fs.mkdirSync(scriptDir, { recursive: true });
  const source = path.join(repoRoot, "skills", "kanon", "scripts", scriptName);
  const target = path.join(scriptDir, scriptName);
  fs.copyFileSync(source, target);
  return { root, target };
}

function findPowerShell() {
  for (const candidate of ["pwsh", "pwsh.exe", "powershell.exe", "powershell"]) {
    const result = spawnSync(candidate, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"], {
      encoding: "utf8"
    });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }

  return null;
}

function writeFakeKanonCommand(binDir, markerPath) {
  const fakeJs = path.join(binDir, "fake-kanon.cjs");
  fs.writeFileSync(
    fakeJs,
    `const fs = require("node:fs");\nfs.writeFileSync(${JSON.stringify(markerPath)}, process.argv.slice(2).join("\\n") + "\\n", "utf8");\n`,
    "utf8"
  );

  if (process.platform === "win32") {
    fs.writeFileSync(path.join(binDir, "kanon.cmd"), '@echo off\r\nnode "%~dp0fake-kanon.cjs" %*\r\n', "utf8");
    return;
  }

  const fakeKanon = path.join(binDir, "kanon");
  fs.writeFileSync(fakeKanon, '#!/usr/bin/env sh\nnode "$(dirname "$0")/fake-kanon.cjs" "$@"\n', "utf8");
  fs.chmodSync(fakeKanon, 0o755);
}

function withPrependedPath(env, binDir) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  return {
    ...env,
    [pathKey]: `${binDir}${path.delimiter}${env[pathKey] || ""}`
  };
}

function makeInteractiveStdin(text) {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  const lines = String(text).split(/(?<=\n)/);
  lines.forEach((line, index) => {
    setTimeout(() => {
      stdin.write(line);
    }, index * 5);
  });
  setTimeout(() => {
    stdin.end();
  }, Math.max(25, lines.length * 5 + 10));
  return stdin;
}

function makeCaptureStdout(options = {}) {
  let output = "";
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    }
  });
  stdout.isTTY = Boolean(options.isTTY);
  stdout.readOutput = () => output;
  return stdout;
}

async function captureRunCli(argv) {
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    output += chunk;
    return true;
  };

  try {
    await runCli(argv);
  } finally {
    process.stdout.write = originalWrite;
  }

  return output;
}
