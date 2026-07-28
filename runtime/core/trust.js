const UNSAFE_CONTROLS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const ANSI_SEQUENCE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

/**
 * @typedef {{
 *   trust: "repository-untrusted",
 *   value: string
 * }} RepositoryValue
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isPlainRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * @param {Record<string, unknown>} value
 * @param {readonly string[]} keys
 * @returns {boolean}
 */
export function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

/**
 * @param {unknown} value
 * @param {number} maximum
 * @returns {value is string}
 */
export function isBoundedString(value, maximum) {
  return (
    typeof value === "string" &&
    Number.isSafeInteger(maximum) &&
    maximum > 0 &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= maximum
  );
}

/**
 * Sanitize hostile display text while retaining line boundaries needed for
 * visibly delimited repository excerpts.
 *
 * @param {unknown} value
 * @param {number} maximum
 * @param {{multiline?: boolean, preserveWhitespace?: boolean}} [options]
 * @returns {string}
 */
export function sanitizeDisplayText(value, maximum, options = {}) {
  if (
    typeof value !== "string" ||
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > 1024 * 1024
  ) {
    return "";
  }
  const multiline = options.multiline === true;
  const preserveWhitespace = options.preserveWhitespace === true;
  // Bound hostile input before applying regular expressions. Compatibility
  // normalization is intentionally avoided because it can turn distinct
  // repository identifiers or structured keys into different data.
  let selected = value
    .slice(0, maximum)
    .replace(ANSI_SEQUENCE, "")
    .replace(UNSAFE_CONTROLS, " ")
    .replace(/\u001b\][^\u0007]*(?:\u0007|$)/g, " ");
  selected = preserveWhitespace
    ? selected
    : multiline
    ? selected
        .replace(/\r\n?/g, "\n")
        .replace(/[^\S\n]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{4,}/g, "\n\n\n")
    : selected.replace(/\s+/g, " ");
  return truncateUtf8(
    preserveWhitespace ? selected : selected.trim(),
    maximum
  );
}

/**
 * @param {unknown} value
 * @param {number} maximum
 * @returns {RepositoryValue}
 */
export function repositoryValue(value, maximum) {
  return {
    trust: "repository-untrusted",
    value: sanitizeDisplayText(value, maximum)
  };
}

/**
 * Preserve already-validated identifier whitespace while removing unsafe
 * terminal and bidi controls and retaining the explicit repository trust tag.
 *
 * @param {unknown} value
 * @param {number} maximum
 * @returns {RepositoryValue}
 */
export function repositoryIdentifier(value, maximum) {
  return {
    trust: "repository-untrusted",
    value: sanitizeDisplayText(value, maximum, {
      preserveWhitespace: true
    })
  };
}

/**
 * @param {unknown[]} values
 * @param {number} maximumItems
 * @param {number} maximumText
 * @returns {string[]}
 */
export function boundedDiagnostics(values, maximumItems, maximumText) {
  return Array.from(
    new Set(
      values
        .map((value) => sanitizeDisplayText(value, maximumText))
        .filter(Boolean)
    )
  ).slice(0, maximumItems);
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
export function isNonnegativeSafeInteger(value) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

/**
 * @param {string} value
 * @param {number} maximumBytes
 * @returns {string}
 */
function truncateUtf8(value, maximumBytes) {
  if (Buffer.byteLength(value, "utf8") <= maximumBytes) {
    return value;
  }
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (
      Buffer.byteLength(value.slice(0, middle), "utf8") <= maximumBytes
    ) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  let selected = value.slice(0, low);
  const tail = selected.charCodeAt(selected.length - 1);
  if (tail >= 0xd800 && tail <= 0xdbff) {
    selected = selected.slice(0, -1);
  }
  return selected;
}
