import {
  extractCommandsFromMarkdown,
  verifyCommand
} from "./commands.js";
import { observeFeatureClaims } from "./claims.js";

/**
 * @typedef {{
 *   type: string,
 *   severity: string,
 *   conclusion: "contradiction" | "unknown",
 *   claim: string,
 *   observation: string,
 *   evidence: string[],
 *   suggestion?: string
 * }} VerificationObservation
 * @typedef {{
 *   readmeTarget: string | null,
 *   readmeFile: import("../scanner/read.js").ScannedFile | null,
 *   readmeText: string,
 *   skillInfo: unknown,
 *   scan: {complete: boolean},
 *   files: import("../scanner/read.js").ScannedFile[],
 *   evidence: import("../evidence.js").EvidenceBook,
 *   packageInfo: {
 *     scripts: Record<string, unknown>,
 *     json: unknown,
 *     evidence: string
 *   } | null,
 *   deploy: {files: {path: string}[]},
 *   ci: {found: boolean},
 *   release: {found: boolean},
 *   findTerm: (
 *     term: unknown,
 *     options?: {exclude?: unknown[]}
 *   ) => string[]
 * }} VerificationContext
 * @typedef {{
 *   target: string,
 *   checked: boolean,
 *   applicable: boolean,
 *   scan_complete: boolean,
 *   note?: string,
 *   commands_checked?: number,
 *   issues: VerificationObservation[],
 *   unknowns: VerificationObservation[]
 * }} VerificationResult
 */

/**
 * @param {VerificationContext} context
 * @returns {VerificationResult}
 */
export function verifyReadme(context) {
  /** @type {VerificationObservation[]} */
  const issues = [];
  /** @type {VerificationObservation[]} */
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

  const checkedContext = {
    ...context,
    readmeFile: context.readmeFile
  };
  const commands = extractCommandsFromMarkdown(context.readmeText);
  for (const command of commands) {
    const issue = verifyCommand(command, checkedContext);
    if (issue) {
      if (issue.conclusion === "contradiction") {
        issues.push(issue);
      } else {
        unknowns.push(issue);
      }
    }
  }

  unknowns.push(...observeFeatureClaims(checkedContext));

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
