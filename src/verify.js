import path from "node:path";
import { findByPath } from "./scanner.js";

export function verifyReadme(context) {
  const issues = [];
  const target = context.readmeFile?.path || "README.md";

  if (!context.readmeFile || !context.readmeText) {
    return {
      target,
      checked: false,
      issues: [
        {
          type: "missing_readme",
          severity: "info",
          claim: "No README file found.",
          observation: "Kanon could not verify README claims because no README was detected.",
          evidence: []
        }
      ]
    };
  }

  const commands = extractCommandsFromMarkdown(context.readmeText);
  for (const command of commands) {
    const issue = verifyCommand(command, context);
    if (issue) {
      issues.push(issue);
    }
  }

  issues.push(...verifyFeatureClaims(context));

  return {
    target,
    checked: true,
    commands_checked: commands.length,
    issues
  };
}

export function extractCommandsFromMarkdown(markdown) {
  const commands = new Set();
  const promptPattern = /^\s*\$\s+(.+)$/gm;
  const inlinePattern = /`(((?:(?:npm|npx|pnpm|yarn|pytest|python3?|node|docker)\b)|kanon(?=\s|$))[^`\n]*)`/gi;
  let match;

  while ((match = promptPattern.exec(markdown))) {
    addCommand(commands, match[1]);
  }

  while ((match = inlinePattern.exec(markdown))) {
    addCommand(commands, match[1]);
  }

  for (const command of extractFencedCodeCommands(markdown)) {
    addCommand(commands, command);
  }

  return Array.from(commands);
}

function extractFencedCodeCommands(markdown) {
  const commands = [];
  const fencePattern = /```[A-Za-z0-9_-]*\n([\s\S]*?)```/g;
  const commandLinePattern = /^\s*(((?:(?:npm|npx|pnpm|yarn|pytest|python3?|node|docker)\b)|kanon(?=\s|$))[^\n]*)$/i;
  let match;

  while ((match = fencePattern.exec(markdown))) {
    for (const line of match[1].split(/\r?\n/)) {
      const command = line.match(commandLinePattern);
      if (command) {
        commands.push(command[1]);
      }
    }
  }

  return commands;
}

function addCommand(commands, raw) {
  const command = raw
    .replace(/\s+#.*$/, "")
    .replace(/\s+&&.*$/, "")
    .trim();

  if (!command || command.startsWith("git clone") || command.startsWith("cd ")) {
    return;
  }

  commands.add(command);
}

function verifyCommand(command, context) {
  const packageScripts = context.packageInfo?.scripts || {};
  const available = Object.keys(packageScripts);
  const readmeEvidence = context.evidence.add(
    "file",
    context.readmeFile.path,
    `README documents command \`${command}\`.`,
    command
  );

  const scriptCheck = npmScriptExpectation(command);
  if (scriptCheck && context.packageInfo) {
    if (!packageScripts[scriptCheck.script]) {
      return {
        type: "command_drift",
        severity: "warning",
        claim: `README says to run \`${command}\`.`,
        observation: `package.json has no \`${scriptCheck.script}\` script; available scripts: ${available.length ? available.join(", ") : "(none)"}.`,
        evidence: [readmeEvidence, context.packageInfo.evidence].filter(Boolean),
        suggestion: `Update README.md or add the missing \`${scriptCheck.script}\` script.`
      };
    }
    return null;
  }

  const nodeTarget = command.match(/^node\s+([^\s]+)/);
  if (nodeTarget) {
    const rel = normalizeCommandPath(nodeTarget[1]);
    if (!findByPath(context.files, rel)) {
      return {
        type: "command_drift",
        severity: "warning",
        claim: `README says to run \`${command}\`.`,
        observation: `No file found at ${rel}.`,
        evidence: [readmeEvidence],
        suggestion: "Update the documented node command or add the referenced file."
      };
    }
  }

  const pythonTarget = command.match(/^python(?:3)?\s+([^\s-][^\s]*)/);
  if (pythonTarget && /\.py$/.test(pythonTarget[1])) {
    const rel = normalizeCommandPath(pythonTarget[1]);
    if (!findByPath(context.files, rel)) {
      return {
        type: "command_drift",
        severity: "warning",
        claim: `README says to run \`${command}\`.`,
        observation: `No Python file found at ${rel}.`,
        evidence: [readmeEvidence],
        suggestion: "Update the documented Python command or add the referenced file."
      };
    }
  }

  return null;
}

function verifyFeatureClaims(context) {
  const issues = [];
  const text = context.readmeText;
  const lower = text.toLowerCase();
  const readmePath = context.readmeFile.path;

  if (/\bpdf\b|pdf export|export.*pdf/i.test(text)) {
    const matches = context.findTerm("pdf", { exclude: [readmePath] });
    if (!matches.length) {
      const evidence = context.evidence.add(
        "file",
        readmePath,
        "README mentions PDF support.",
        excerptAround(text, /pdf/i)
      );
      issues.push({
        type: "unsupported_feature_claim",
        severity: "warning",
        claim: "README mentions PDF support.",
        observation: "No non-README file reference to PDF was found.",
        evidence: [evidence],
        suggestion: "Add code/tests/docs for PDF support or remove the README claim."
      });
    }
  }

  if (/\bdocker\b|docker compose|container/i.test(text) && !context.deploy.files.some((file) => /docker|compose/i.test(file.path))) {
    const evidence = context.evidence.add(
      "file",
      readmePath,
      "README mentions Docker/container support.",
      excerptAround(text, /docker|container/i)
    );
    issues.push({
      type: "unsupported_feature_claim",
      severity: "warning",
      claim: "README mentions Docker/container support.",
      observation: "No Dockerfile or compose file was found.",
      evidence: [evidence],
      suggestion: "Add Docker configuration or update the README."
    });
  }

  if ((/\bci\b|continuous integration/i.test(text)) && !context.ci.found) {
    const evidence = context.evidence.add(
      "file",
      readmePath,
      "README mentions CI.",
      excerptAround(text, /ci|continuous integration/i)
    );
    issues.push({
      type: "unsupported_process_claim",
      severity: "warning",
      claim: "README mentions CI.",
      observation: "No CI configuration was found.",
      evidence: [evidence],
      suggestion: "Add CI config or update the README."
    });
  }

  if (/production[-\s]ready|production ready|ready for production/i.test(text)) {
    const gaps = [
      !context.ci.found ? "CI" : null,
      !context.deploy.found ? "deployment config" : null,
      !context.release.found ? "release workflow/changelog" : null
    ].filter(Boolean);

    if (gaps.length) {
      const evidence = context.evidence.add(
        "file",
        readmePath,
        "README claims production readiness.",
        excerptAround(text, /production[-\s]ready|ready for production/i)
      );
      issues.push({
        type: "unsupported_process_claim",
        severity: "warning",
        claim: "README claims production readiness.",
        observation: `No evidence found for: ${gaps.join(", ")}.`,
        evidence: [evidence],
        suggestion: "Qualify the claim or add the missing operational evidence."
      });
    }
  }

  if (lower.includes("release") && !context.release.found) {
    const evidence = context.evidence.add(
      "file",
      readmePath,
      "README mentions releases.",
      excerptAround(text, /release/i)
    );
    issues.push({
      type: "unsupported_process_claim",
      severity: "info",
      claim: "README mentions releases.",
      observation: "No release workflow, releaserc, or changelog was found.",
      evidence: [evidence],
      suggestion: "Add release evidence or clarify the release process."
    });
  }

  return issues;
}

function npmScriptExpectation(command) {
  const normalized = command.trim();
  const match = normalized.match(/^(npm|pnpm)\s+(start|test|build|dev)$/);
  if (match) {
    return { manager: match[1], script: match[2] };
  }

  const run = normalized.match(/^(npm|pnpm)\s+run\s+([A-Za-z0-9:_-]+)/);
  if (run) {
    return { manager: run[1], script: run[2] };
  }

  const yarn = normalized.match(/^yarn\s+([A-Za-z0-9:_-]+)/);
  if (yarn && yarn[1] !== "install" && yarn[1] !== "add") {
    return { manager: "yarn", script: yarn[1] };
  }

  return null;
}

function normalizeCommandPath(value) {
  return path.normalize(value.replace(/^\.\//, "")).replaceAll("\\", "/");
}

function excerptAround(text, pattern) {
  const match = text.match(pattern);
  if (!match || match.index === undefined) {
    return "";
  }

  const start = Math.max(0, match.index - 80);
  const end = Math.min(text.length, match.index + 160);
  return text.slice(start, end);
}
