export function createRunId(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
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
