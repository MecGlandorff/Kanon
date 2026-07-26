import {
  extractCommandsFromMarkdown,
  verifyCommand
} from "./commands.js";
import { verifyFeatureClaims } from "./claims.js";

export function verifyReadme(context) {
  const issues = [];
  const target = context.readmeTarget ||
    context.readmeFile?.path ||
    "README.md";

  if (!context.readmeFile || !context.readmeText) {
    if (context.skillInfo) {
      return {
        target,
        checked: false,
        applicable: false,
        scan_complete: context.scan.complete,
        note: "README verification is not applicable to a self-contained skill package with SKILL.md.",
        issues: []
      };
    }
    return {
      target,
      checked: false,
      applicable: true,
      scan_complete: context.scan.complete,
      issues: [
        {
          type: "missing_readme",
          severity: "info",
          claim: `No README file found at ${target}.`,
          observation: `Kanon could not verify README claims because ${target} was not detected.`,
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
    applicable: true,
    scan_complete: context.scan.complete,
    commands_checked: commands.length,
    issues
  };
}
