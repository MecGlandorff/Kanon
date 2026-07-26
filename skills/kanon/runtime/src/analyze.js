import path from "node:path";
import { inspectRepoCode } from "./code-intel.js";
import { readKanonConfig, scanOptionsFromConfig } from "./config.js";
import { EvidenceBook } from "./evidence.js";
import { inspectGit } from "./git.js";
import {
  findByPath,
  findFirst,
  findTextReferences,
  readText,
  scanRepo
} from "./scanner.js";
import { verifyReadme } from "./verify.js";
import { STATE_SCHEMA_VERSION, VERSION } from "./version.js";
import { buildCurrentState } from "./analyze/current-state.js";
import { detectEntrypoints, detectTodos } from "./analyze/entrypoints.js";
import { detectCommands, detectImportantFiles } from "./analyze/findings.js";
import {
  detectPurpose,
  readPackageJson,
  readPyproject,
  readPythonHints,
  readSkillInfo
} from "./analyze/metadata.js";
import {
  detectCi,
  detectDeployment,
  detectLanguages,
  detectRelease,
  detectTests
} from "./analyze/project-signals.js";
import {
  firstHeadingOrLine,
  normalizeRequestedPath
} from "./analyze/utils.js";

export function analyzeRepo(root = process.cwd(), options = {}) {
  const resolvedRoot = path.resolve(root);
  const config = readKanonConfig(resolvedRoot);
  const scanned = scanRepo(
    resolvedRoot,
    scanOptionsFromConfig(config, options.scan)
  );
  const evidence = new EvidenceBook(options.runId);
  const files = scanned.files;
  const readme = readReadme(
    resolvedRoot,
    files,
    options.readmePath,
    evidence
  );
  const packageInfo = readPackageJson(resolvedRoot, files, evidence);
  const pyprojectInfo = readPyproject(resolvedRoot, files, evidence);
  const pythonInfo = readPythonHints(resolvedRoot, files, evidence);
  const skillInfo = readSkillInfo(resolvedRoot, files, evidence);
  const codeIntel = inspectRepoCode(resolvedRoot, files, {
    packageJson: packageInfo?.json
  });
  const git = inspectGit(resolvedRoot, evidence);
  const languages = detectLanguages(files, packageInfo, pyprojectInfo);
  const ci = detectCi(files, evidence);
  const deploy = detectDeployment(files, evidence);
  const release = detectRelease(files, evidence);
  const tests = detectTests(
    files,
    evidence,
    packageInfo,
    pyprojectInfo,
    pythonInfo
  );
  const commands = detectCommands(
    packageInfo,
    pyprojectInfo,
    pythonInfo,
    tests,
    codeIntel,
    evidence
  );
  const importantFiles = detectImportantFiles(evidence, codeIntel);
  const todos = detectTodos(resolvedRoot, files);
  const purpose = detectPurpose(
    {
      ...readme,
      packageInfo,
      pyprojectInfo,
      skillInfo
    },
    evidence
  );
  const likelyEntrypoints = detectEntrypoints(
    files,
    packageInfo,
    pyprojectInfo,
    evidence,
    codeIntel
  );
  const context = {
    root: resolvedRoot,
    files,
    ...readme,
    skillInfo,
    packageInfo,
    pyprojectInfo,
    pythonInfo,
    ci,
    deploy,
    release,
    codeIntel,
    tests,
    commands,
    evidence,
    scan: scanned.diagnostics,
    findTerm: (term, opts = {}) =>
      findTextReferences(resolvedRoot, files, term, opts)
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
  return {
    root: resolvedRoot,
    state: buildState({
      resolvedRoot,
      repoName,
      languages,
      scanned,
      evidence,
      git,
      purpose,
      commands,
      importantFiles,
      codeIntel,
      tests,
      ci,
      deploy,
      release,
      todos,
      currentState,
      verification
    }),
    evidence: evidence.records
  };
}

function readReadme(root, files, requestedPath, evidence) {
  const readmeTarget = normalizeRequestedPath(requestedPath);
  let readmeFile = readmeTarget
    ? findByPath(files, readmeTarget)
    : findFirst(files, [
        "README.md",
        "README.mdx",
        "README.rst",
        "README.adoc",
        "README.txt",
        "README"
      ]);
  let readmeText = readmeFile ? readText(root, readmeFile.path) : "";
  if (readmeTarget && !readmeFile) {
    const explicitText = readText(root, readmeTarget);
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
  return { readmeTarget, readmeFile, readmeText, readmeEvidence };
}

function buildState(input) {
  return {
    version: VERSION,
    run_id: input.evidence.runId,
    generated_at: new Date().toISOString(),
    repo: {
      name: input.repoName,
      root: input.resolvedRoot,
      languages: input.languages,
      files_scanned: input.scanned.files.length
    },
    scan: input.scanned.diagnostics,
    git: input.git,
    purpose: input.purpose,
    commands: input.commands,
    important_files: input.importantFiles,
    code_intelligence: {
      files_with_inbound_imports: input.codeIntel.importers.size,
      entrypoints: input.codeIntel.entrypoints,
      top_fan_in: input.codeIntel.ranked_files
        .filter((item) => item.fan_in > 0)
        .slice(0, 12)
        .map((item) => ({ path: item.path, fan_in: item.fan_in }))
    },
    tests: input.tests,
    ci: input.ci,
    deployment: input.deploy,
    release: input.release,
    todos: input.todos,
    current_state: input.currentState,
    verification: input.verification,
    files: { fingerprints: input.scanned.fingerprints },
    evidence_count: input.evidence.records.length,
    schema_version: STATE_SCHEMA_VERSION
  };
}
