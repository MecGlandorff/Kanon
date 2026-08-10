const MAX_REGISTRY_TEXT = 512;

/**
 * Convert untrusted registry prose to bounded single-line display data.
 *
 * @param {unknown} value
 * @returns {{ok: true, value: string} | {ok: false, status: "Unknown"}}
 */
export function sanitizeRegistryText(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4_096) {
    return { ok: false, status: "Unknown" };
  }
  const sanitized = value
    .normalize("NFKC")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/[<>`]/g, (character) =>
      character === "<" ? "‹" : character === ">" ? "›" : "'"
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REGISTRY_TEXT);
  return sanitized.length > 0
    ? { ok: true, value: sanitized }
    : { ok: false, status: "Unknown" };
}

/**
 * @param {string} installedVersion
 * @param {string} reason
 * @returns {string}
 */
export function renderDeprecationWarning(installedVersion, reason) {
  return (
    `Installed Kanon version ${installedVersion} is deprecated. ` +
    `Registry text is untrusted data: <<<${reason}>>>. ` +
    "Upgrading is a separate user-approved action."
  );
}
