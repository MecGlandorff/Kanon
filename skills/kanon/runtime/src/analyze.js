import path from "node:path";
import { readKanonConfig, scanOptionsFromConfig } from "./config.js";
import { EvidenceBook } from "./evidence.js";
import { inspectGit } from "./git.js";
import {
  fileExists,
  findByPath,
  findFirst,
  findTextReferences,
  readText,
  scanRepo
} from "./scanner.js";
import { verifyReadme } from "./verify.js";
import { STATE_SCHEMA_VERSION, VERSION } from "./version.js";

export function analyzeRepo(root = process.cwd(), options = {}) {
  const resolvedRoot = path.resolve(root);
  const config = readKanonConfig(resolvedRoot);
  const scanned = scanRepo(resolvedRoot, scanOptionsFromConfig(config, options.scan));
  const evidence = new EvidenceBook(options.runId);
  const files = scanned.files;

  const readmeTarget = normalizeRequestedPath(options.readmePath);
  let readmeFile = readmeTarget
    ? findByPath(files, readmeTarget)
    : findFirst(files, ["README.md", "README.mdx", "README.txt", "README"]);
  let readmeText = readmeFile ? readText(resolvedRoot, readmeFile.path) : "";
  if (readmeTarget && !readmeFile) {
    const explicitText = readText(resolvedRoot, readmeTarget);
    if (explicitText) {
      readmeFile = {
        path: readmeTarget,
        basename: path.posix.basename(readmeTarget),
        extension: path.posix.extname(readmeTarget).toLowerCase(),
        text: true
      };
      readmeText = explicitText;
    }
  }
  const readmeEvidence = readmeFile
    ? evidence.add(
        "file",
        readmeFile.path,
        "README found and used as declared-intent evidence.",
        firstHeadingOrLine(readmeText)
      )
    : null;

  const packageInfo = readPackageJson(resolvedRoot, files, evidence);
  const pyprojectInfo = readPyproject(resolvedRoot, files, evidence);
  const pythonInfo = readPythonHints(resolvedRoot, files, evidence);
  const skillInfo = readSkillInfo(resolvedRoot, files, evidence);
  const git = inspectGit(resolvedRoot, evidence);
  const languages = detectLanguages(files, packageInfo, pyprojectInfo);
  const ci = detectCi(files, evidence);
  const deploy = detectDeployment(files, evidence);
  const release = detectRelease(files, evidence);
  const tests = detectTests(files, evidence, packageInfo, pyprojectInfo, pythonInfo);
  const commands = detectCommands(packageInfo, pyprojectInfo, pythonInfo, tests);
  const importantFiles = detectImportantFiles(files, evidence);
  const todos = detectTodos(resolvedRoot, files);
  const purpose = detectPurpose(
    readmeFile,
    readmeText,
    readmeEvidence,
    packageInfo,
    pyprojectInfo,
    skillInfo,
    evidence
  );
  const likelyEntrypoints = detectEntrypoints(files, packageInfo, pyprojectInfo, evidence);

  const context = {
    root: resolvedRoot,
    files,
    readmeFile,
    readmeTarget,
    readmeText,
    readmeEvidence,
    skillInfo,
    packageInfo,
    pyprojectInfo,
    pythonInfo,
    ci,
    deploy,
    release,
    tests,
    commands,
    evidence,
    scan: scanned.diagnostics,
    findTerm: (term, opts = {}) => findTextReferences(resolvedRoot, files, term, opts)
  };

  const verification = verifyReadme(context);
  const currentState = buildCurrentState({
    purpose,
    commands,
    likelyEntrypoints,
    tests,
    ci,
    deploy,
    release,
    git,
    scan: scanned.diagnostics,
    todos,
    verification
  });

  const repoName =
    packageInfo?.json?.name ||
    pyprojectInfo?.name ||
    path.basename(resolvedRoot);

  const state = {
    version: VERSION,
    run_id: evidence.runId,
    generated_at: new Date().toISOString(),
    repo: {
      name: repoName,
      root: resolvedRoot,
      languages,
      files_scanned: files.length
    },
    scan: scanned.diagnostics,
    git,
    purpose,
    commands,
    important_files: importantFiles,
    tests,
    ci,
    deployment: deploy,
    release,
    todos,
    current_state: currentState,
    verification,
    files: {
      fingerprints: scanned.fingerprints
    },
    evidence_count: evidence.records.length,
    schema_version: STATE_SCHEMA_VERSION
  };

  return {
    root: resolvedRoot,
    state,
    evidence: evidence.records
  };
}

function readPackageJson(root, files, evidence) {
  const file = findByPath(files, "package.json");
  if (!file) {
    return null;
  }

  const text = readText(root, file.path);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      path: file.path,
      json: null,
      scripts: {},
      evidence: evidence.add("config", file.path, "package.json exists but could not be parsed.")
    };
  }

  const scripts = json.scripts && typeof json.scripts === "object" ? json.scripts : {};
  const evidenceId = evidence.add(
    "config",
    file.path,
    `package.json declares package ${json.name || "(unnamed)"} with ${Object.keys(scripts).length} script(s).`,
    JSON.stringify({ name: json.name, scripts })
  );

  return {
    path: file.path,
    json,
    scripts,
    evidence: evidenceId
  };
}

function readPyproject(root, files, evidence) {
  const file = findByPath(files, "pyproject.toml");
  if (!file) {
    return null;
  }

  const text = readText(root, file.path);
  const scripts = parseTomlSection(text, "project.scripts");
  const name = findTomlString(text, "name");
  const description = findTomlString(text, "description");
  const hasPytest = /\[tool\.pytest\b/.test(text);
  const evidenceId = evidence.add(
    "config",
    file.path,
    `pyproject.toml declares Python project metadata${hasPytest ? " and pytest configuration" : ""}.`,
    text.slice(0, 500)
  );

  return {
    path: file.path,
    name,
    description,
    scripts,
    hasPytest,
    evidence: evidenceId
  };
}

function readPythonHints(root, files, evidence) {
  const hints = {
    requirements: null,
    pytestConfig: null,
    mentionsPytest: false
  };

  for (const candidate of ["requirements.txt", "pytest.ini", "setup.cfg", "tox.ini"]) {
    const file = findByPath(files, candidate);
    if (!file) {
      continue;
    }

    const text = readText(root, file.path, { limit: 40_000 });
    const id = evidence.add("config", file.path, `${candidate} found.`, text.slice(0, 300));
    if (candidate === "requirements.txt") {
      hints.requirements = { path: file.path, evidence: id };
      hints.mentionsPytest = /(^|\n)\s*pytest(?:[<>=~!;\s]|$)/i.test(text);
    }
    if (candidate !== "requirements.txt" && /pytest/i.test(text)) {
      hints.pytestConfig = { path: file.path, evidence: id };
    }
  }

  return hints;
}

function readSkillInfo(root, files, evidence) {
  const file = findByPath(files, "SKILL.md");
  if (!file) {
    return null;
  }
  const text = readText(root, file.path, { limit: 40_000 });
  const description = text.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1] || null;
  return {
    path: file.path,
    description,
    evidence: evidence.add(
      "config",
      file.path,
      "SKILL.md found and used as declared-intent evidence.",
      description || ""
    )
  };
}

function detectLanguages(files, packageInfo, pyprojectInfo) {
  const languages = new Set();
  if (packageInfo || files.some((file) => [".js", ".jsx", ".mjs", ".ts", ".tsx"].includes(file.extension))) {
    languages.add("JavaScript/TypeScript");
  }
  if (pyprojectInfo || files.some((file) => file.extension === ".py")) {
    languages.add("Python");
  }
  if (files.some((file) => file.extension === ".go")) {
    languages.add("Go");
  }
  if (files.some((file) => file.extension === ".rs")) {
    languages.add("Rust");
  }

  return Array.from(languages);
}

function detectCi(files, evidence) {
  const ciFiles = files.filter((file) =>
    /^\.github\/workflows\/[^/]+\.(ya?ml)$/.test(file.path) ||
    file.path === ".gitlab-ci.yml" ||
    file.path === "circle.yml" ||
    /^\.circleci\/config\.ya?ml$/.test(file.path)
  );

  return {
    found: ciFiles.length > 0,
    files: ciFiles.map((file) => ({
      path: file.path,
      evidence: evidence.add("config", file.path, "CI configuration found.")
    }))
  };
}

function detectDeployment(files, evidence) {
  const patterns = [
    /^Dockerfile$/,
    /^docker-compose\.ya?ml$/,
    /^compose\.ya?ml$/,
    /^fly\.toml$/,
    /^vercel\.json$/,
    /^netlify\.toml$/,
    /^render\.ya?ml$/,
    /^railway\.json$/,
    /^Procfile$/
  ];
  const deployFiles = files.filter((file) => patterns.some((pattern) => pattern.test(file.path)));

  return {
    found: deployFiles.length > 0,
    files: deployFiles.map((file) => ({
      path: file.path,
      evidence: evidence.add("config", file.path, "Deployment/runtime configuration found.")
    }))
  };
}

function detectRelease(files, evidence) {
  const releaseFiles = files.filter((file) =>
    /^\.github\/workflows\/.*release.*\.(ya?ml)$/.test(file.path) ||
    /^CHANGELOG\.md$/i.test(file.path) ||
    /^\.releaserc/.test(file.path)
  );

  return {
    found: releaseFiles.length > 0,
    files: releaseFiles.map((file) => ({
      path: file.path,
      evidence: evidence.add("file", file.path, "Release/changelog evidence found.")
    }))
  };
}

function detectTests(files, evidence, packageInfo, pyprojectInfo, pythonInfo) {
  const testFiles = files.filter((file) =>
    /(^|\/)(test|tests|__tests__)\//.test(file.path) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(file.path) ||
    /test_.*\.py$/.test(file.path) ||
    /_test\.py$/.test(file.path)
  );

  const testEvidence = [];
  if (testFiles.length > 0) {
    testEvidence.push(
      evidence.add(
        "test",
        testFiles[0].path,
        `${testFiles.length} test-like file(s) found.`,
        testFiles.slice(0, 12).map((file) => file.path).join(", ")
      )
    );
  }

  const hasPytest =
    Boolean(pyprojectInfo?.hasPytest) ||
    Boolean(pythonInfo?.pytestConfig) ||
    Boolean(pythonInfo?.mentionsPytest);
  const hasPackageTest = Boolean(packageInfo?.scripts?.test);

  return {
    found: testFiles.length > 0 || hasPackageTest || hasPytest,
    files: testFiles.slice(0, 50).map((file) => file.path),
    count: testFiles.length,
    frameworks: [
      ...(hasPackageTest ? ["npm test script"] : []),
      ...(hasPytest ? ["pytest"] : [])
    ],
    evidence: testEvidence
  };
}

function detectCommands(packageInfo, pyprojectInfo, pythonInfo, tests) {
  const commands = {
    run: [],
    test: [],
    build: [],
    dev: []
  };

  if (packageInfo?.scripts) {
    for (const [name, script] of Object.entries(packageInfo.scripts)) {
      const command =
        name === "start" ? "npm start" :
        name === "test" ? "npm test" :
        `npm run ${name}`;
      const item = {
        command,
        source: "package.json",
        confidence: "known",
        evidence: [packageInfo.evidence],
        detail: script
      };

      if (name === "test") {
        commands.test.push(item);
      } else if (name === "build") {
        commands.build.push(item);
      } else if (name === "dev") {
        commands.dev.push(item);
        commands.run.push(item);
      } else if (name === "start") {
        commands.run.push(item);
      }
    }
  }

  if (packageInfo?.json?.bin) {
    if (typeof packageInfo.json.bin === "string" && packageInfo.json.name) {
      commands.run.push({
        command: packageInfo.json.name,
        source: "package.json bin",
        confidence: "known",
        evidence: [packageInfo.evidence],
        detail: packageInfo.json.bin
      });
    } else if (typeof packageInfo.json.bin === "object") {
      for (const [name, target] of Object.entries(packageInfo.json.bin)) {
        commands.run.push({
          command: name,
          source: "package.json bin",
          confidence: "known",
          evidence: [packageInfo.evidence],
          detail: target
        });
      }
    }
  }

  if (pyprojectInfo?.scripts) {
    for (const [name, target] of Object.entries(pyprojectInfo.scripts)) {
      commands.run.push({
        command: name,
        source: "pyproject.toml [project.scripts]",
        confidence: "known",
        evidence: [pyprojectInfo.evidence],
        detail: target
      });
    }
  }

  if (
    tests.frameworks.includes("pytest") &&
    !commands.test.some((item) => item.command === "pytest")
  ) {
    commands.test.push({
      command: "pytest",
      source: pythonInfo.pytestConfig?.path || pyprojectInfo?.path || "test files",
      confidence: "known",
      evidence: [
        pythonInfo.pytestConfig?.evidence,
        pyprojectInfo?.evidence,
        ...tests.evidence
      ].filter(Boolean)
    });
  }

  return commands;
}

function detectImportantFiles(files, evidence) {
  const important = [];
  const candidates = [
    "README.md",
    "SKILL.md",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "src/index.js",
    "src/index.ts",
    "src/cli.js",
    "src/run.py",
    "src/main.py",
    "bin/kanon.js"
  ];

  for (const relPath of candidates) {
    const file = findByPath(files, relPath);
    if (!file) {
      continue;
    }

    important.push({
      path: file.path,
      reason: reasonForImportantFile(file.path),
      evidence: [evidence.add("file", file.path, `Important repo file detected: ${file.path}.`)]
    });
  }

  const workflows = files.filter((file) => /^\.github\/workflows\//.test(file.path)).slice(0, 3);
  for (const file of workflows) {
    if (!important.some((item) => item.path === file.path)) {
      important.push({
        path: file.path,
        reason: "CI or automation workflow",
        evidence: [evidence.add("config", file.path, "GitHub Actions workflow detected.")]
      });
    }
  }

  return important.slice(0, 16);
}

function detectTodos(root, files) {
  const todos = [];

  for (const file of files) {
    if (!file.text || todos.length >= 40) {
      continue;
    }

    if (!/\.(js|jsx|mjs|ts|tsx|py|md|toml|yaml|yml|json|sh)$/i.test(file.path)) {
      continue;
    }

    const text = readText(root, file.path, { limit: 120_000 });
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (todos.length >= 40) {
        return;
      }

      if (isTodoLine(line)) {
        todos.push({
          path: file.path,
          line: index + 1,
          text: line.trim().slice(0, 180)
        });
      }
    });
  }

  return todos;
}

function isTodoLine(line) {
  return (
    /(?:^|\s)(?:\/\/|#|\/\*|\*)\s*\b(TODO|FIXME)\b(?::|\s)/i.test(line) ||
    /^\s*-\s*\b(TODO|FIXME)\b(?::|\s)/i.test(line)
  );
}

function detectPurpose(readmeFile, readmeText, readmeEvidence, packageInfo, pyprojectInfo, skillInfo, evidence) {
  if (packageInfo?.json?.description) {
    return {
      claim: packageInfo.json.description,
      confidence: "likely",
      evidence: [packageInfo.evidence]
    };
  }

  if (pyprojectInfo?.description) {
    return {
      claim: pyprojectInfo.description,
      confidence: "likely",
      evidence: [pyprojectInfo.evidence]
    };
  }

  if (readmeFile && readmeText) {
    const excerpt = firstHeadingOrLine(readmeText);
    const id =
      readmeEvidence ||
      evidence.add("file", readmeFile.path, "README used to infer declared repo purpose.", excerpt);
    return {
      claim: excerpt || `Declared in ${readmeFile.path}`,
      confidence: "likely",
      evidence: [id]
    };
  }

  if (skillInfo?.description) {
    return {
      claim: skillInfo.description,
      confidence: "likely",
      evidence: [skillInfo.evidence]
    };
  }

  return {
    claim: "No README or package metadata found to describe the repo purpose.",
    confidence: "unknown",
    evidence: []
  };
}

function detectEntrypoints(files, packageInfo, pyprojectInfo, evidence) {
  const entrypoints = [];

  const packageEntrypoints = [
    packageInfo?.json?.bin && typeof packageInfo.json.bin === "string" ? packageInfo.json.bin : null,
    packageInfo?.json?.main,
    packageInfo?.json?.module
  ].filter(Boolean);

  if (packageInfo?.json?.bin && typeof packageInfo.json.bin === "object") {
    packageEntrypoints.push(...Object.values(packageInfo.json.bin));
  }

  for (const relPath of packageEntrypoints) {
    const normalized = String(relPath).replace(/^\.\//, "");
    if (fileExists(files, normalized)) {
      entrypoints.push({
        claim: `${normalized} appears to be a package entrypoint.`,
        evidence: [packageInfo.evidence]
      });
    }
  }

  for (const relPath of ["src/cli.js", "src/index.js", "src/index.ts", "src/run.py", "src/main.py", "main.py"]) {
    if (fileExists(files, relPath)) {
      entrypoints.push({
        claim: `${relPath} appears to be an entrypoint by convention.`,
        evidence: [evidence.add("file", relPath, "Likely entrypoint file found by convention.")]
      });
    }
  }

  if (pyprojectInfo?.scripts && Object.keys(pyprojectInfo.scripts).length > 0) {
    entrypoints.push({
      claim: `pyproject.toml exposes CLI script(s): ${Object.keys(pyprojectInfo.scripts).join(", ")}.`,
      evidence: [pyprojectInfo.evidence]
    });
  }

  return uniqueClaims(entrypoints).slice(0, 8);
}

function buildCurrentState(input) {
  const known = [];
  const likely = [];
  const unknown = [];
  const staleSuspicious = [];
  const suggested = [];

  if (input.purpose.confidence === "known") {
    known.push({
      claim: `Repo purpose: ${input.purpose.claim}`,
      evidence: input.purpose.evidence
    });
  } else if (input.purpose.confidence === "likely") {
    likely.push({
      claim: `Declared repo purpose: ${input.purpose.claim}`,
      evidence: input.purpose.evidence
    });
  }

  for (const group of ["test", "run", "build", "dev"]) {
    for (const command of input.commands[group]) {
      known.push({
        claim: `${group} command: ${command.command}`,
        evidence: command.evidence
      });
    }
  }

  if (input.tests.found) {
    known.push({
      claim: `${input.tests.count || "Some"} test evidence found${input.tests.frameworks.length ? ` (${input.tests.frameworks.join(", ")})` : ""}.`,
      evidence: input.tests.evidence
    });
  }

  if (input.ci.found) {
    known.push({
      claim: `CI configuration found: ${input.ci.files.map((file) => file.path).join(", ")}.`,
      evidence: input.ci.files.map((file) => file.evidence)
    });
  }

  if (input.deploy.found) {
    known.push({
      claim: `Deployment/runtime configuration found: ${input.deploy.files.map((file) => file.path).join(", ")}.`,
      evidence: input.deploy.files.map((file) => file.evidence)
    });
  }

  if (input.git.found) {
    known.push({
      claim: `Git repository${input.git.branch ? ` on branch ${input.git.branch}` : ""}; ${input.git.change_count} working-tree change(s).`,
      evidence: input.git.evidence
    });
  }

  for (const entrypoint of input.likelyEntrypoints) {
    likely.push(entrypoint);
  }

  if (!input.commands.test.length) {
    unknown.push({
      claim: "No explicit test command found.",
      reason: "No package test script, pytest config, or test command evidence was detected."
    });
  }

  if (!input.ci.found) {
    unknown.push({
      claim: "No CI configuration found.",
      reason: "No GitHub Actions, GitLab CI, CircleCI, or similar CI config was detected."
    });
  }

  if (!input.deploy.found) {
    unknown.push({
      claim: "No deployment path found.",
      reason: "No Dockerfile, Procfile, platform config, or compose file was detected."
    });
  }

  if (!input.release.found) {
    unknown.push({
      claim: "No release workflow or changelog found.",
      reason: "No release workflow, releaserc, or CHANGELOG.md was detected."
    });
  }

  if (!input.scan.complete) {
    unknown.push({
      claim: "Repository scan was incomplete.",
      reason: scanLimitationReason(input.scan)
    });
  }

  if (input.scan.sensitive_files_skipped > 0) {
    unknown.push({
      claim: `${input.scan.sensitive_files_skipped} sensitive file(s) were intentionally excluded.`,
      reason: "Kanon does not read, hash, cite, or persist likely secret-bearing files."
    });
  }

  for (const issue of input.verification.issues) {
    staleSuspicious.push({
      claim: issue.claim,
      reason: issue.observation,
      evidence: issue.evidence
    });
  }

  if (input.commands.test.length) {
    suggested.push({
      claim: `Run ${input.commands.test[0].command} first.`,
      reason: "A test command was detected from repo evidence."
    });
  } else {
    suggested.push({
      claim: "Identify and document the test command.",
      reason: "Kanon could not find a current test command."
    });
  }

  if (input.verification.issues.length > 0) {
    suggested.push({
      claim: "Fix or confirm README drift before trusting setup instructions.",
      reason: `${input.verification.issues.length} suspicious README claim(s) were detected.`
    });
  }

  if (!input.ci.found) {
    suggested.push({
      claim: "Add CI once the local test command is verified.",
      reason: "No CI evidence was found."
    });
  }

  if (input.todos.length > 0) {
    suggested.push({
      claim: `Review ${input.todos.length} TODO/FIXME marker(s).`,
      reason: "Inline work markers were detected in repo files."
    });
  }

  const entrypoint = input.likelyEntrypoints[0];
  if (entrypoint) {
    suggested.push({
      claim: `Inspect ${extractPathFromClaim(entrypoint.claim)} next.`,
      reason: "It appears to be the main entrypoint."
    });
  }

  return {
    known,
    likely,
    unknown,
    stale_suspicious: staleSuspicious,
    suggested
  };
}

function parseTomlSection(text, section) {
  const header = `[${section}]`;
  const lines = text.split(/\r?\n/);
  const entries = {};
  let active = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[.+\]$/.test(trimmed)) {
      active = trimmed === header;
      continue;
    }

    if (!active) {
      continue;
    }

    const item = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*["']([^"']+)["']/);
    if (item) {
      entries[item[1]] = item[2];
    }
  }

  return entries;
}

function findTomlString(text, key) {
  const match = text.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*["']([^"']+)["']`, "m"));
  return match?.[1] || null;
}

function reasonForImportantFile(relPath) {
  if (/readme/i.test(relPath)) {
    return "declared repo intent and usage";
  }
  if (relPath === "package.json" || relPath === "pyproject.toml") {
    return "package metadata and commands";
  }
  if (relPath === "SKILL.md") {
    return "skill trigger and operating instructions";
  }
  if (/requirements|pytest|setup/.test(relPath)) {
    return "Python dependency or test configuration";
  }
  if (/src\/(cli|index|run|main)\./.test(relPath) || /^bin\//.test(relPath)) {
    return "likely entrypoint";
  }
  return "important repo file";
}

function firstHeadingOrLine(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const heading = lines.find((line) => /^#\s+/.test(line));
  if (heading) {
    return heading.replace(/^#\s+/, "").trim();
  }
  return lines[0] || "";
}

function extractPathFromClaim(claim) {
  return claim.split(/\s+/)[0] || "the likely entrypoint";
}

function uniqueClaims(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (seen.has(item.claim)) {
      continue;
    }
    seen.add(item.claim);
    unique.push(item);
  }
  return unique;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRequestedPath(value) {
  if (!value) {
    return null;
  }
  const normalized = path.posix.normalize(String(value).replaceAll("\\", "/").replace(/^\.\//, ""));
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`README path must stay inside the repository: ${value}`);
  }
  return normalized;
}

function scanLimitationReason(scan) {
  const reasons = [];
  if (scan.truncated) {
    reasons.push(`the ${scan.max_files}-file scan limit was reached`);
  }
  if (scan.unreadable_entries) {
    reasons.push(`${scan.unreadable_entries} entry or directory read(s) failed`);
  }
  return reasons.length ? `${reasons.join("; ")}.` : "The scan did not complete.";
}
