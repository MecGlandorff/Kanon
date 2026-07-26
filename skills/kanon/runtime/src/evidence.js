import { normalizeExcerpt } from "./scanner/shared.js";
import {
  REPOSITORY_UNTRUSTED,
  safeTerminalText
} from "./trust.js";

let runSequence = 0;

export function createRunId(options = {}) {
  const date = options.date || new Date();
  const timestamp = date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 17);
  if (options.unique === false) {
    return timestamp;
  }
  runSequence = (runSequence + 1) % 1_679_616;
  return `${timestamp}${process.pid.toString(36)}${runSequence.toString(36).padStart(4, "0")}`;
}

export class EvidenceBook {
  constructor(runId = createRunId()) {
    this.runId = runId;
    this.next = 1;
    this.records = [];
  }

  add(kind, path, claim, excerpt = "", options = {}) {
    const id = `e_${this.runId}_${String(this.next).padStart(3, "0")}`;
    this.next += 1;

    const record = {
      id,
      kind: safeTerminalText(kind),
      path: safeTerminalText(path),
      claim: safeTerminalText(claim),
      trust: options.trust || REPOSITORY_UNTRUSTED
    };

    const cleanExcerpt = safeTerminalText(
      normalizeExcerpt(excerpt)
    );
    if (cleanExcerpt) {
      record.excerpt = cleanExcerpt;
    }

    this.records.push(record);
    return id;
  }
}
