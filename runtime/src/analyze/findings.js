/**
 * @typedef {import("./metadata.js").PackageInfo} PackageInfo
 * @typedef {import("./metadata.js").PyprojectInfo} PyprojectInfo
 * @typedef {import("./metadata.js").PythonHints} PythonHints
 * @typedef {import("./project-signals.js").TestSignal} TestSignal
 * @typedef {{
 *   command: string,
 *   cwd: string,
 *   source: string,
 *   confidence: "known" | "likely" | "unknown",
 *   evidence: string[],
 *   detail?: string | null
 * }} DeclaredCommand
 * @typedef {{
 *   run: DeclaredCommand[],
 *   test: DeclaredCommand[],
 *   build: DeclaredCommand[],
 *   dev: DeclaredCommand[]
 * }} DeclaredCommands
 */

/**
 * @param {PackageInfo | null} packageInfo
 * @param {PyprojectInfo | null} pyprojectInfo
 * @param {PythonHints} pythonInfo
 * @param {TestSignal} tests
 * @param {ReturnType<typeof import("../code-intel.js").inspectRepoCode>}
 *   codeIntel
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @returns {DeclaredCommands}
 */
export function detectCommands(
  packageInfo,
  pyprojectInfo,
  pythonInfo,
  tests,
  codeIntel,
  evidence
) {
  /** @type {DeclaredCommands} */
  const commands = { run: [], test: [], build: [], dev: [] };
  /** @type {(keyof DeclaredCommands)[]} */
  const groups = ["run", "test", "build", "dev"];
  for (const group of groups) {
    for (const item of codeIntel.commands[group]) {
      const evidenceId = packageInfo && item.source === packageInfo.path
        ? packageInfo.evidence
        : pyprojectInfo && item.source === pyprojectInfo.path
          ? pyprojectInfo.evidence
          : evidence.add(
          "command",
          item.source,
          `${group} command detected from repository content: ${item.command}.`,
          item.detail || ""
          );
      commands[group].push({
        command: item.command,
        cwd: item.cwd || ".",
        source: item.source,
        confidence: item.confidence,
        evidence: evidenceId ? [evidenceId] : [],
        detail: item.detail
      });
    }
  }
  addPackageBinaries(commands, packageInfo);
  addPythonScripts(commands, pyprojectInfo);
  if (tests.frameworks.includes("pytest") && commands.test.length === 0) {
    commands.test.push({
      command: "pytest",
      source:
        pythonInfo.pytestConfig?.path ||
        pyprojectInfo?.path ||
        "test files",
      confidence: "likely",
      cwd: ".",
      evidence: [
        pythonInfo.pytestConfig?.evidence,
        pyprojectInfo?.evidence,
        ...tests.evidence
      ].filter((value) => typeof value === "string")
    });
  }
  return commands;
}

/**
 * @param {import("../evidence.js").EvidenceBook} evidence
 * @param {ReturnType<typeof import("../code-intel.js").inspectRepoCode>}
 *   codeIntel
 */
export function detectImportantFiles(evidence, codeIntel) {
  return codeIntel.ranked_files
    .filter((item) => item.recommended)
    .map((item) => {
    const reason =
      item.reasons.slice(0, 3).join("; ") || "important repo file";
    return {
      path: item.path,
      reason,
      fan_in: item.fan_in,
      evidence: [
        evidence.add(
          "file",
          item.path,
          `Important repo file ranked from content evidence: ${reason}.`
        )
      ]
    };
    });
}

/**
 * @param {DeclaredCommands} commands
 * @param {PackageInfo | null} packageInfo
 * @returns {void}
 */
function addPackageBinaries(commands, packageInfo) {
  const bin = packageInfo?.json?.bin;
  if (!bin || commands.run.length > 0 || !packageInfo) {
    return;
  }
  if (typeof bin === "string" && packageInfo.name) {
    commands.run.push({
      command: packageInfo.name,
      source: "package.json bin",
      confidence: "known",
      cwd: ".",
      evidence: [packageInfo.evidence],
      detail: bin
    });
  } else if (plainRecord(bin)) {
    for (const [name, target] of Object.entries(bin)) {
      if (typeof target !== "string") {
        continue;
      }
      commands.run.push({
        command: name,
        source: "package.json bin",
        confidence: "known",
        cwd: ".",
        evidence: [packageInfo.evidence],
        detail: target
      });
    }
  }
}

/**
 * @param {DeclaredCommands} commands
 * @param {PyprojectInfo | null} pyprojectInfo
 * @returns {void}
 */
function addPythonScripts(commands, pyprojectInfo) {
  if (!pyprojectInfo?.scripts) {
    return;
  }
  for (const [name, target] of Object.entries(pyprojectInfo.scripts)) {
    commands.run.push({
      command: name,
      source: "pyproject.toml [project.scripts]",
      confidence: "known",
      cwd: ".",
      evidence: [pyprojectInfo.evidence],
      detail: target
    });
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function plainRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
