import {
  atomicWritePluginDataText,
  readPluginDataText,
  resolveExternalPluginDataRoot
} from "./plugin-data.js";
import {
  isContextReceipt,
  receiptRootSha256,
  RECEIPT_RETENTION_MS
} from "./receipt.js";
import {
  hasExactKeys,
  isBoundedString,
  isNonnegativeSafeInteger,
  isPlainRecord
} from "./trust.js";

const STORE_FILE = "context-receipts-v1.json";
const STORE_SCHEMA = "kanon-context-receipt-store-v1";
const MAX_STORE_BYTES = 16 * 1024;
const MAX_RECEIPTS = 8;

/**
 * @typedef {{
 *   schema: "kanon-context-receipt-store-v1",
 *   receipts: import("./receipt.js").ContextReceipt[]
 * }} ReceiptStoreDocument
 * @typedef {{
 *   ok: true,
 *   found: true,
 *   receipt: import("./receipt.js").ContextReceipt
 * } | {
 *   ok: true,
 *   found: false,
 *   diagnostic: string
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} ReceiptStoreReadResult
 * @typedef {{
 *   ok: true,
 *   replaced: boolean,
 *   retained: number,
 *   recovered_invalid: boolean
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} ReceiptStoreWriteResult
 */

/**
 * Read a receipt only from a validated plugin-data root outside the inspected
 * repository. Missing data is an ordinary Unknown input.
 *
 * @param {unknown} pluginDataRoot
 * @param {unknown} repositoryRoot
 * @param {unknown} now
 * @returns {ReceiptStoreReadResult}
 */
export function readContextReceiptStore(
  pluginDataRoot,
  repositoryRoot,
  now
) {
  const scope = resolveReceiptScope(
    pluginDataRoot,
    repositoryRoot,
    now
  );
  if (!scope.ok) {
    return scope;
  }
  const loaded = readDocument(scope.pluginDataRoot);
  if (!loaded.ok) {
    return loaded;
  }
  const receipt = loaded.value.receipts.find(
    (candidate) =>
      candidate.root_sha256 === scope.rootSha256 &&
      candidate.issued_at <= scope.now &&
      scope.now - candidate.issued_at <= RECEIPT_RETENTION_MS
  );
  return receipt
    ? { ok: true, found: true, receipt }
    : {
        ok: true,
        found: false,
        diagnostic:
          "No retained plugin-data receipt matched the active repository root."
      };
}

/**
 * Replace the active repository receipt after an explicit orient invocation.
 * The fixed-size document retains only recent receipts for other roots.
 *
 * @param {unknown} pluginDataRoot
 * @param {unknown} repositoryRoot
 * @param {unknown} receipt
 * @param {unknown} now
 * @returns {ReceiptStoreWriteResult}
 */
export function writeContextReceiptStore(
  pluginDataRoot,
  repositoryRoot,
  receipt,
  now
) {
  const scope = resolveReceiptScope(
    pluginDataRoot,
    repositoryRoot,
    now
  );
  if (!scope.ok || !isContextReceipt(receipt)) {
    return storeFailure();
  }
  if (
    receipt.root_sha256 !== scope.rootSha256 ||
    receipt.issued_at !== scope.now
  ) {
    return storeFailure();
  }
  const loaded = readDocument(scope.pluginDataRoot);
  const current = loaded.ok ? loaded.value.receipts : [];
  const recoveredInvalid = !loaded.ok;
  const replaced = current.some(
    (candidate) => candidate.root_sha256 === scope.rootSha256
  );
  const retained = current
    .filter(
      (candidate) =>
        candidate.root_sha256 !== scope.rootSha256 &&
        candidate.issued_at <= scope.now &&
        scope.now - candidate.issued_at <= RECEIPT_RETENTION_MS
    )
    .sort((left, right) => right.issued_at - left.issued_at)
    .slice(0, MAX_RECEIPTS - 1);
  const document = {
    schema: /** @type {"kanon-context-receipt-store-v1"} */ (
      STORE_SCHEMA
    ),
    receipts: [receipt, ...retained]
  };
  if (!isReceiptStoreDocument(document)) {
    return storeFailure();
  }
  const written = writeDocument(scope.pluginDataRoot, document);
  return written.ok
    ? {
        ok: true,
        replaced,
        retained: document.receipts.length,
        recovered_invalid: recoveredInvalid
      }
    : written;
}

/**
 * @param {unknown} pluginDataRoot
 * @param {unknown} repositoryRoot
 * @param {unknown} now
 * @returns {{
 *   ok: true,
 *   pluginDataRoot: string,
 *   rootSha256: string,
 *   now: number
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }}
 */
function resolveReceiptScope(pluginDataRoot, repositoryRoot, now) {
  if (
    !isBoundedString(repositoryRoot, 8_192) ||
    !isNonnegativeSafeInteger(now)
  ) {
    return storeFailure();
  }
  const root = resolveExternalPluginDataRoot(
    pluginDataRoot,
    repositoryRoot
  );
  if (!root.ok) {
    return storeFailure();
  }
  return {
    ok: true,
    pluginDataRoot: root.root,
    rootSha256: receiptRootSha256(root.repository_root),
    now
  };
}

/**
 * @param {string} root
 * @returns {{
 *   ok: true,
 *   value: ReceiptStoreDocument
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }}
 */
function readDocument(root) {
  const loaded = readPluginDataText(
    root,
    STORE_FILE,
    MAX_STORE_BYTES
  );
  if (!loaded.ok) {
    return storeFailure();
  }
  if (!loaded.found) {
    return {
      ok: true,
      value: {
        schema: STORE_SCHEMA,
        receipts: []
      }
    };
  }
  try {
    const value = JSON.parse(loaded.text);
    return isReceiptStoreDocument(value)
      ? { ok: true, value }
      : storeFailure();
  } catch {
    return storeFailure();
  }
}

/**
 * @param {string} root
 * @param {ReceiptStoreDocument} document
 * @returns {ReceiptStoreWriteResult}
 */
function writeDocument(root, document) {
  if (!isReceiptStoreDocument(document)) {
    return storeFailure();
  }
  const written = atomicWritePluginDataText(
    root,
    STORE_FILE,
    `${JSON.stringify(document)}\n`,
    MAX_STORE_BYTES
  );
  return written.ok
    ? {
        ok: true,
        replaced: false,
        retained: document.receipts.length,
        recovered_invalid: false
      }
    : storeFailure();
}

/**
 * @param {unknown} value
 * @returns {value is ReceiptStoreDocument}
 */
function isReceiptStoreDocument(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["receipts", "schema"]) ||
    value.schema !== STORE_SCHEMA ||
    !Array.isArray(value.receipts) ||
    value.receipts.length > MAX_RECEIPTS ||
    !value.receipts.every(isContextReceipt)
  ) {
    return false;
  }
  const roots = new Set(
    value.receipts.map((receipt) => receipt.root_sha256)
  );
  return roots.size === value.receipts.length;
}

/**
 * @returns {{
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: "Receipt plugin-data storage is unavailable or invalid."
 * }}
 */
function storeFailure() {
  return {
    ok: false,
    status: "Unknown",
    diagnostic:
      "Receipt plugin-data storage is unavailable or invalid."
  };
}
