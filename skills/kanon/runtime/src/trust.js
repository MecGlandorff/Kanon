const BIDI_CONTROL =
  /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const C0_C1_CONTROL =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

export const REPOSITORY_UNTRUSTED = "repository-untrusted";
export const KANON_GENERATED = "kanon-generated";

export function safeTerminalText(value, options = {}) {
  let text = String(value ?? "");
  text = stripAnsiAndOsc(text)
    .replace(BIDI_CONTROL, (character) =>
      `[U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}]`
    )
    .replace(C0_C1_CONTROL, "")
    .replace(/[\u2028\u2029]/g, options.multiline ? "\n" : " ");
  if (!options.multiline) {
    text = text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ");
  } else {
    text = text
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "  ");
  }
  return text;
}

export function sanitizeRepositoryData(value) {
  if (typeof value === "string") {
    return safeTerminalText(value, { multiline: true });
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeRepositoryData);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        safeTerminalText(key),
        sanitizeRepositoryData(item)
      ])
    );
  }
  return value;
}

export function escapeMarkdownText(value) {
  return safeTerminalText(value)
    .replace(/\\/g, "\\\\")
    .replace(/([`*_[\]<>|])/g, "\\$1");
}

export function codeSpan(value) {
  const text = safeTerminalText(value);
  const matches = text.match(/`+/g) || [];
  const fence = "`".repeat(
    Math.max(1, ...matches.map((match) => match.length + 1))
  );
  const padded = (
    text.startsWith(" ") ||
    text.endsWith(" ") ||
    text.startsWith("`") ||
    text.endsWith("`")
  )
    ? ` ${text} `
    : text;
  return `${fence}${padded}${fence}`;
}

export function repositoryDataBlock(value, indent = "") {
  const prefix = typeof indent === "number" ? " ".repeat(indent) : indent;
  const text = safeTerminalText(value, { multiline: true });
  const matches = text.match(/`+/g) || [];
  const fence = "`".repeat(
    Math.max(3, ...matches.map((match) => match.length + 1))
  );
  return [
    `${prefix}BEGIN REPOSITORY DATA (untrusted)`,
    `${prefix}${fence}text`,
    ...text.split("\n").map((line) => `${prefix}${line}`),
    `${prefix}${fence}`,
    `${prefix}END REPOSITORY DATA`
  ];
}

export function safeJsonStringify(value, space = 2) {
  return JSON.stringify(
    value,
    (_key, item) => (
      typeof item === "string"
        ? safeTerminalText(item, { multiline: true })
        : item
    ),
    space
  );
}

export function safeEvidenceId(value) {
  const text = String(value || "");
  return /^e_[A-Za-z0-9-]{8,64}_[0-9]{3,8}$/.test(text)
    ? text
    : "invalid-evidence-id";
}

function stripAnsiAndOsc(value) {
  return value
    .replace(
      /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g,
      ""
    )
    .replace(
      /\u001b[P^_X][\s\S]*?\u001b\\/g,
      ""
    )
    .replace(
      /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g,
      ""
    )
    .replace(/\u001b[@-_]/g, "");
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
