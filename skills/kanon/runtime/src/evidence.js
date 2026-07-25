let runSequence = 0;

export function createRunId(date = new Date()) {
  const timestamp = date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 17);
  if (arguments.length > 0) {
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

  add(kind, path, claim, excerpt = "") {
    const id = `e_${this.runId}_${String(this.next).padStart(3, "0")}`;
    this.next += 1;

    const record = {
      id,
      kind,
      path,
      claim
    };

    const cleanExcerpt = normalizeExcerpt(excerpt);
    if (cleanExcerpt) {
      record.excerpt = cleanExcerpt;
    }

    this.records.push(record);
    return id;
  }
}

export function normalizeExcerpt(value, limit = 240) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
