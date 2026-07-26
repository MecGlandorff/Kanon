import { excerptAround, hasAffirmedMatch } from "./language.js";

export function verifyFeatureClaims(context) {
  const issues = [];
  const text = context.readmeText;
  const readmePath = context.readmeFile.path;

  if (hasAffirmedMatch(text, /\bpdf\b|pdf export|export.*pdf/i)) {
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

  if (
    hasAffirmedMatch(text, /\bdocker\b|docker compose|container/i) &&
    !context.deploy.files.some((file) => /docker|compose/i.test(file.path))
  ) {
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

  if (
    hasAffirmedMatch(text, /\bci\b|continuous integration/i) &&
    !context.ci.found
  ) {
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

  if (
    hasAffirmedMatch(
      text,
      /production[-\s]ready|production ready|ready for production/i
    )
  ) {
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
        excerptAround(
          text,
          /production[-\s]ready|ready for production/i
        )
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

  if (hasAffirmedMatch(text, /\breleases?\b/i) && !context.release.found) {
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
