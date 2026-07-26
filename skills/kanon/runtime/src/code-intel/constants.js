export const CODE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cjs",
  ".cts",
  ".go",
  ".h",
  ".java",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".py",
  ".rs",
  ".ts",
  ".tsx"
]);

export const JS_EXTENSIONS = [
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts"
];

export const DOC_PATTERN =
  /(^|\/)(readme(?:\.[^.]+)?|contributing\.(?:md|rst)|setup\.(?:md|rst)|development\.(?:md|rst))$/i;

export const LOW_VALUE_PATH =
  /(^|\/)(fixtures?|snapshots?|testdata|vendor|generated|dist|build|coverage)\//i;

export const GENERATED_FILE =
  /(?:\.min\.(?:js|css)$|_pb2\.py$|\.snap$|\.lock$)/i;
