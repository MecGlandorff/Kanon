export function hasAffirmedMatch(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  let match;
  while ((match = matcher.exec(text))) {
    if (!isNegatedAt(text, match.index, match[0].length)) {
      return true;
    }
  }
  return false;
}

export function isNegatedAt(text, index, length) {
  const sentenceStart = Math.max(
    text.lastIndexOf("\n", index - 1),
    text.lastIndexOf(".", index - 1),
    text.lastIndexOf("!", index - 1),
    text.lastIndexOf("?", index - 1)
  );
  const candidates = [
    text.indexOf("\n", index + length),
    text.indexOf(".", index + length),
    text.indexOf("!", index + length),
    text.indexOf("?", index + length)
  ].filter((value) => value >= 0);
  const sentenceEnd = candidates.length
    ? Math.min(...candidates)
    : Math.min(text.length, index + length + 100);
  const clause = text
    .slice(Math.max(sentenceStart + 1, index - 100), sentenceEnd)
    .toLowerCase();
  return /\b(?:no|not|never|without|lacks?|lacking|unsupported|doesn't|does not|isn't|is not|aren't|are not|won't|will not)\b/.test(
    clause
  );
}

export function excerptAround(text, pattern) {
  const match = text.match(pattern);
  if (!match || match.index === undefined) {
    return "";
  }

  const start = Math.max(0, match.index - 80);
  const end = Math.min(text.length, match.index + 160);
  return text.slice(start, end);
}
