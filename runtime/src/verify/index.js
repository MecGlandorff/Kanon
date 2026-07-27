import {
  extractCommandsFromMarkdown,
  verifyCommand
} from "./commands.js";
import { observeFeatureClaims } from "./claims.js";

export function verifyReadme(context) {
  const issues = [];
  const unknowns = [];
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
        issues: [],
        unknowns: []
      };
    }
    return {
      target,
      checked: false,
      applicable: true,
      scan_complete: context.scan.complete,
      issues: [],
      unknowns: [
        {
          type: "missing_readme",
          severity: "info",
          conclusion: "unknown",
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
      if (issue.conclusion === "contradiction") {
        issues.push(issue);
      } else {
        unknowns.push(issue);
      }
    }
  }

  unknowns.push(...observeFeatureClaims(context));

  return {
    target,
    checked: true,
    applicable: true,
    scan_complete: context.scan.complete,
    commands_checked: commands.length,
    issues,
    unknowns
  };
}
