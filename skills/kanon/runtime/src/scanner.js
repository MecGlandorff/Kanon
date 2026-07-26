export { scanRepo } from "./scanner/scan.js";
export {
  createReadBudget,
  fileExists,
  findByPath,
  findFirst,
  findTextHits,
  findTextReferences,
  readText,
  readTextResult
} from "./scanner/read.js";
export {
  assertContainedPath,
  resolveContainedPath,
  sanitizeFilenameComponent
} from "./path-security.js";
export { isSensitivePath } from "./scanner/policy.js";
