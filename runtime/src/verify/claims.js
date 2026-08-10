import { excerptAround, hasAffirmedMatch } from "./language.js";

const CONTAINER_CLAIM =
  /\bdocker(?:file)?\b|\bdocker\s+compose\b|\bcontainer images?\b|\bcontaineri[sz]ed\b|\b(?:run|deploy|ship|support)\w*\s+(?:\w+\s+){0,2}containers?\b/i;

/**
 * @param {import("./index.js").VerificationContext & {
 *   readmeFile: import("../scanner/read.js").ScannedFile
 * }} context
 * @returns {import("./index.js").VerificationObservation[]}
 */
export function observeFeatureClaims(context) {
  /** @type {import("./index.js").VerificationObservation[]} */
  const unknowns = [];
  const text = context.readmeText;
  const readmePath = context.readmeFile.path;

  if (hasAffirmedMatch(text, /\bpdf\b|pdf export|export.*pdf/i)) {
    const matches = context.findTerm("pdf", { exclude: [readmePath] });
    if (!matches.length) {
      unknowns.push(nonObservation(
        context,
        readmePath,
        "README declares PDF-related behavior.",
        "Current bounded checks did not observe a non-README literal PDF reference. This is not evidence that PDF support is absent.",
        excerptAround(text, /pdf/i)
      ));
    }
  }

  if (
    hasAffirmedMatch(text, CONTAINER_CLAIM) &&
    !context.deploy.files.some((file) => /docker|compose/i.test(file.path))
  ) {
    unknowns.push(nonObservation(
      context,
      readmePath,
      "README declares Docker or container behavior.",
      "Current checks did not find a conventional Dockerfile or compose path. This non-observation is not a contradiction.",
      excerptAround(text, CONTAINER_CLAIM)
    ));
  }

  if (
    hasAffirmedMatch(text, /\bci\b|continuous integration/i) &&
    !context.ci.found
  ) {
    unknowns.push(nonObservation(
      context,
      readmePath,
      "README declares CI behavior.",
      "Current checks did not find a conventional CI configuration. This non-observation is not a contradiction.",
      excerptAround(text, /ci|continuous integration/i)
    ));
  }

  if (
    hasAffirmedMatch(
      text,
      /production[-\s]ready|production ready|ready for production/i
    )
  ) {
    unknowns.push(nonObservation(
      context,
      readmePath,
      "README declares production readiness.",
      "Kanon does not verify production readiness; conventional operational files are only observations.",
      excerptAround(
        text,
        /production[-\s]ready|ready for production/i
      )
    ));
  }

  if (
    hasAffirmedMatch(text, /\breleases?\b/i) &&
    !context.release.found
  ) {
    unknowns.push(nonObservation(
      context,
      readmePath,
      "README declares a release process.",
      "Current checks did not find a conventional release workflow or changelog. This non-observation is not a contradiction.",
      excerptAround(text, /release/i)
    ));
  }

  return unknowns;
}

/**
 * @param {import("./index.js").VerificationContext} context
 * @param {string} path
 * @param {string} claim
 * @param {string} observation
 * @param {string} excerpt
 * @returns {import("./index.js").VerificationObservation}
 */
function nonObservation(context, path, claim, observation, excerpt) {
  const evidence = context.evidence.add(
    "file",
    path,
    claim,
    excerpt
  );
  return {
    type: "non_observation",
    severity: "info",
    conclusion: "unknown",
    claim,
    observation: context.scan.complete
      ? observation
      : `${observation} The repository scan was incomplete.`,
    evidence: [evidence]
  };
}
