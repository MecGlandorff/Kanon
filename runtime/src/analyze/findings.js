export function detectCommands(
  packageInfo,
  pyprojectInfo,
  pythonInfo,
  tests,
  codeIntel,
  evidence
) {
  const commands = { run: [], test: [], build: [], dev: [] };
  for (const group of ["run", "test", "build", "dev"]) {
    for (const item of codeIntel.commands[group]) {
      const evidenceId =
        item.source === packageInfo?.path ? packageInfo.evidence :
        item.source === pyprojectInfo?.path ? pyprojectInfo.evidence :
        evidence.add(
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
        evidence: [evidenceId].filter(Boolean),
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
      ].filter(Boolean)
    });
  }
  return commands;
}

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

function addPackageBinaries(commands, packageInfo) {
  if (!packageInfo?.json?.bin || commands.run.length > 0) {
    return;
  }
  if (
    typeof packageInfo.json.bin === "string" &&
    packageInfo.json.name
  ) {
    commands.run.push({
      command: packageInfo.json.name,
      source: "package.json bin",
      confidence: "known",
      cwd: ".",
      evidence: [packageInfo.evidence],
      detail: packageInfo.json.bin
    });
  } else if (typeof packageInfo.json.bin === "object") {
    for (const [name, target] of Object.entries(packageInfo.json.bin)) {
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
