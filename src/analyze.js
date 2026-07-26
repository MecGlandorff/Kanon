import path from "node:path";
import { inspectRepoCode } from "./code-intel.js";
import { inspectKanonConfig, scanOptionsFromConfig } from "./config.js";
import { EvidenceBook } from "./evidence.js";
import { inspectGit } from "./git.js";
import {
  createReadBudget,
  findByPath,
  findTextReferences,
  readText,
  readTextResult,
  scanRepo
} from "./scanner.js";
import { selectRootReadme } from "./readme.js";
import { verifyReadme } from "./verify.js";
import { STATE_SCHEMA_VERSION, VERSION } from "./version.js";
import { sanitizeRepositoryData } from "./trust.js";
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
  const requestedRoot = path.resolve(root);
  const evidence = new EvidenceBook(options.runId);
  const configInspection = inspectKanonConfig(requestedRoot);
  const configEvidence = configInspection.warning
    ? evidence.add(
        "config",
        ".kanon/config.json",
        configInspection.warning
      )
    : null;
  const configuration = {
    found: configInspection.found,
    valid: configInspection.valid,
    warning: configInspection.warning,
    invalid_field: configInspection.invalid_field,
    command_execution: configInspection.config.command_execution,
    evidence: configEvidence ? [configEvidence] : []
  };
  const effectiveScanOptions = scanOptionsFromConfig(
    configInspection.config,
    options.scan
  );
  const scanned = scanRepo(requestedRoot, effectiveScanOptions);
  const resolvedRoot = scanned.root;
  const readBudget = createReadBudget(
    effectiveScanOptions.maxTotalTextBytes
  );
  const readOptions = {
    budget: readBudget,
    diagnostics: scanned.diagnostics,
    limit: effectiveScanOptions.maxFileBytes
  };
  const files = scanned.files;
  const readme = readReadme(
    resolvedRoot,
    files,
    options.readmePath,
    evidence,
    readOptions
  );
  const packageInfo = readPackageJson(
    resolvedRoot,
    files,
    evidence,
    readOptions
  );
  const pyprojectInfo = readPyproject(
    resolvedRoot,
    files,
    evidence,
    readOptions
  );
  const pythonInfo = readPythonHints(
    resolvedRoot,
    files,
    evidence,
    readOptions
  );
  const skillInfo = readSkillInfo(
    resolvedRoot,
    files,
    evidence,
    readOptions
  );
  const codeIntel = inspectRepoCode(resolvedRoot, files, {
    packageJson: packageInfo?.json,
    readOptions
  });
  const git = inspectGit(resolvedRoot, evidence, {
    enabled: options.inspectGit !== false,
    timeoutMs: configInspection.config.git.timeout_ms,
    maxOutputBytes: configInspection.config.git.max_output_bytes
  });
  const languages = detectLanguages(files, packageInfo, pyprojectInfo);
  const ci = detectCi(files, evidence);
  const deploy = detectDeployment(files, evidence);
  const release = detectRelease(
    resolvedRoot,
    files,
    evidence,
    readOptions
  );
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
  const todos = detectTodos(resolvedRoot, files, readOptions);
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
    readOptions,
    findTerm: (term, opts = {}) =>
      findTextReferences(resolvedRoot, files, term, {
        ...opts,
        ...readOptions
      })
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
    verification,
    configuration
  });
  scanned.diagnostics.total_text_bytes_read = readBudget.bytesRead;
  const repoName =
    packageInfo?.json?.name ||
    pyprojectInfo?.name ||
    path.basename(resolvedRoot);
  return {
    root: resolvedRoot,
    state: sanitizeRepositoryData(buildState({
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
      verification,
      configuration
    })),
    evidence: evidence.records,
    inspection: {
      files,
      scan: scanned.diagnostics
    }
  };
}

function readReadme(root, files, requestedPath, evidence, readOptions) {
  const readmeTarget = normalizeRequestedPath(requestedPath);
  let readmeFile = readmeTarget
    ? findByPath(files, readmeTarget)
    : selectRootReadme(files);
  let readmeResult = readmeFile
    ? readTextResult(root, readmeFile.path, readOptions)
    : null;
  let readmeText = readmeResult?.ok ? readmeResult.text : "";
  if (readmeTarget && !readmeFile) {
    readmeResult = readTextResult(root, readmeTarget, readOptions);
    if (readmeResult.ok) {
      readmeFile = {
        path: readmeTarget,
        basename: path.posix.basename(readmeTarget),
        extension: path.posix.extname(readmeTarget).toLowerCase(),
        text: true
      };
      readmeText = readmeResult.text;
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
  return {
    readmeTarget,
    readmeFile,
    readmeText,
    readmeEvidence,
    readmeFailure: readmeResult && !readmeResult.ok
      ? readmeResult
      : null
  };
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
    configuration: input.configuration,
    command_execution: {
      policy: input.configuration.command_execution,
      approval_required: true,
      execution_allowed:
        input.configuration.command_execution !== "never",
      trust: "kanon-generated"
    },
    files: { fingerprints: input.scanned.fingerprints },
    evidence_count: input.evidence.records.length,
    schema_version: STATE_SCHEMA_VERSION
  };
}
