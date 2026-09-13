import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export const section = (document, title) => document?.sections.find(
  item => item.title.toLowerCase() === title.toLowerCase(),
);

function scalar(value) {
  const text = value.trim();
  if (text.startsWith('"')) {
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'string') throw new Error('expected a scalar');
    return parsed;
  }
  if (text.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(text)) throw new Error('invalid quoted scalar');
    return text.slice(1, -1).replaceAll("''", "'");
  }
  if (/^[\[\]{}>|&*!]/.test(text) || /[\[\]{}]/.test(text)) {
    throw new Error('nested values and YAML operators are not supported');
  }
  return text;
}

function listItem(text) {
  const pair = text.match(/^([^\s:'"\[\]{}]+):\s+(.+)$/);
  return pair ? { [pair[1]]: scalar(pair[2]) } : scalar(text);
}

function inlineList(text) {
  if (!text.endsWith(']')) throw new Error('unclosed inline list');
  const body = text.slice(1, -1);
  if (!body.trim()) return [];
  const parts = [];
  let start = 0;
  let quote = '';
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (quote) {
      if (quote === '"' && char === '\\') i++;
      else if (char === quote) {
        if (quote === "'" && body[i + 1] === "'") i++;
        else quote = '';
      }
    } else if (char === '"' || char === "'") quote = char;
    else if (char === ',') { parts.push(body.slice(start, i)); start = i + 1; }
  }
  if (quote) throw new Error('unclosed quoted scalar');
  parts.push(body.slice(start));
  if (parts.some(part => !part.trim())) throw new Error('empty list item');
  return parts.map(part => listItem(part.trim()));
}

export function parseDocument(raw, file) {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  const document = { file, raw, frontmatter: {}, fieldLines: {}, listLines: {}, sections: [], problems: [] };
  const problem = (line, message) => document.problems.push({ file, line, message });
  let bodyStart = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end === -1) {
      problem(1, 'unclosed frontmatter');
      bodyStart = 1;
    } else {
      bodyStart = end + 1;
      let activeList;
      for (let i = 1; i < end; i++) {
        const text = lines[i];
        if (!text.trim()) continue;
        try {
          const item = text.match(/^  - (.+)$/);
          if (item && activeList) {
            document.frontmatter[activeList].push(listItem(item[1]));
            document.listLines[activeList].push(i + 1);
            continue;
          }
          activeList = undefined;
          const field = text.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s+(.*))?$/);
          if (!field) throw new Error('unsupported frontmatter line');
          const [, key, value = ''] = field;
          if (Object.hasOwn(document.frontmatter, key)) throw new Error(`duplicate field "${key}"`);
          const parsed = value.trim() === '' ? [] : value.trim().startsWith('[') ? inlineList(value.trim()) : scalar(value);
          document.frontmatter[key] = parsed;
          document.fieldLines[key] = i + 1;
          if (Array.isArray(parsed)) document.listLines[key] = parsed.map(() => i + 1);
          if (value.trim() === '') activeList = key;
        } catch (error) { problem(i + 1, error.message); }
      }
    }
  }
  let current;
  for (let i = bodyStart; i < lines.length; i++) {
    const heading = lines[i].match(/^## (.+?)\s*$/);
    if (heading) {
      current = { title: heading[1], line: i + 1, text: '', lines: [] };
      document.sections.push(current);
    } else if (current) current.lines.push({ text: lines[i], line: i + 1 });
  }
  for (const item of document.sections) item.text = item.lines.map(line => line.text).join('\n').trim();
  return document;
}

function questions(document, owner, ownerType) {
  return (section(document, 'Open questions')?.lines ?? []).flatMap(({ text, line }) => {
    const match = text.match(/^\s*- \[([ xX])\]\s+(?:Q:\s*)?(.+?)(?:\s+\(blocks:\s*([^)]*)\))?\s*$/);
    return match ? [{ owner, ownerType, file: document.file, line, checked: match[1] !== ' ',
      text: match[2], blocks: match[3]?.split(',').map(name => name.trim()).filter(Boolean) ?? [] }] : [];
  });
}

function references(document, key, pairs = false) {
  const value = document.frontmatter[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    document.problems.push({ file: document.file, line: document.fieldLines[key], message: `${key} must be a list` });
    return [];
  }
  return value.flatMap((entry, index) => {
    const line = document.listLines[key][index];
    if (typeof entry === 'string' && entry.trim()) return [{ name: entry, label: '', line }];
    if (pairs && entry && typeof entry === 'object') {
      const [[name, label]] = Object.entries(entry);
      return [{ name, label, line }];
    }
    document.problems.push({ file: document.file, line, message: `invalid ${key} item` });
    return [];
  });
}

function parseSteps(document) {
  const steps = [];
  for (const { text, line } of section(document, 'Steps')?.lines ?? []) {
    if (!text.trim()) continue;
    const transfer = text.match(/^(\d+)\. ([^\s:]+) -> ([^\s:]+)(?: x([1-9]\d*))?: (.+)$/);
    const repeat = text.match(/^(\d+)\. repeat from (\d+) until (.+)$/);
    const match = transfer ?? repeat;
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) !== steps.length + 1 ||
        (transfer?.[4] && !Number.isSafeInteger(Number(transfer[4])))) {
      document.problems.push({ file: document.file, line, message: `invalid flow step; expected step ${steps.length + 1}` });
      continue;
    }
    steps.push(transfer ? { number: Number(transfer[1]), type: 'transfer', from: transfer[2], to: transfer[3],
      fanOut: transfer[4] ? Number(transfer[4]) : null, text: transfer[5], line } :
      { number: Number(repeat[1]), type: 'repeat', fromStep: Number(repeat[2]), text: repeat[3], line });
  }
  return steps;
}

function parseDecisions(document) {
  return document.sections.flatMap(item => {
    const match = item.title.match(/^(D-\d{3,}) · (\d{4}-\d{2}-\d{2}) · (.+)$/);
    if (!match) {
      if (item.title.startsWith('D-')) document.problems.push({ file: document.file, line: item.line, message: 'invalid decision heading' });
      return [];
    }
    const fields = {};
    for (const { text, line } of item.lines) {
      if (!text.trim()) continue;
      const field = text.match(/^(Decision|Why|Scope|Supersedes):\s*(.*)$/);
      if (field) fields[field[1]] = field[2];
      else document.problems.push({ file: document.file, line, message: 'unsupported decision line' });
    }
    return [{ id: match[1], date: match[2], title: match[3], file: document.file, line: item.line,
      decision: fields.Decision ?? '', why: fields.Why ?? '', scope: fields.Scope?.split(',').map(name => name.trim()).filter(Boolean) ?? [],
      supersedes: fields.Supersedes ?? '', raw: `## ${item.title}\n${item.lines.map(line => line.text).join('\n')}`.trimEnd() }];
  });
}

export function parseDesign(designDirectory = resolve('design')) {
  const designDir = resolve(designDirectory);
  let stat;
  try { stat = lstatSync(designDir); } catch { throw new Error(`design folder not found: ${designDir}`); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`design folder must be a real directory: ${designDir}`);
  const model = { designDir, name: basename(dirname(designDir)), system: null, modules: [], flows: [], slices: [], decisions: [], questions: [], problems: [] };
  function read(relative, optional = false) {
    const file = `design/${relative}`;
    try {
      if (!lstatSync(join(designDir, relative)).isFile()) throw new Error('expected a regular file, not a symlink or directory');
      return parseDocument(readFileSync(join(designDir, relative), 'utf8'), file);
    } catch (error) {
      if (!optional || error.code !== 'ENOENT') model.problems.push({ file, line: 1, message: error.code ? `cannot read file (${error.code})` : error.message });
      return null;
    }
  }
  function files(folder) {
    try {
      if (!lstatSync(join(designDir, folder)).isDirectory()) throw new Error('expected a real directory');
      return readdirSync(join(designDir, folder)).filter(name => name.endsWith('.md')).sort().map(name => `${folder}/${name}`);
    } catch (error) {
      if (error.code !== 'ENOENT') model.problems.push({ file: `design/${folder}`, line: 1, message: error.code ? `cannot read directory (${error.code})` : error.message });
      return [];
    }
  }
  function collect(document, owner, ownerType) {
    model.problems.push(...document.problems);
    model.questions.push(...questions(document, owner, ownerType));
  }
  model.system = read('system.md', true);
  if (model.system) {
    const name = model.system.frontmatter.name;
    if (typeof name === 'string' && name) model.name = name;
    else if (name !== undefined) model.system.problems.push({ file: model.system.file, line: model.system.fieldLines.name, message: 'name must be a scalar' });
    collect(model.system, 'system', 'system');
  }
  for (const relative of files('modules')) {
    const document = read(relative);
    if (!document) continue;
    const name = basename(relative, '.md');
    let status = document.frontmatter.status ?? 'proposed';
    if (!['proposed', 'agreed', 'built'].includes(status)) {
      document.problems.push({ file: document.file, line: document.fieldLines.status, message: 'status must be proposed, agreed, or built' });
      status = 'proposed';
    }
    const kind = document.frontmatter.kind ?? '';
    if (typeof kind !== 'string') document.problems.push({ file: document.file, line: document.fieldLines.kind, message: 'kind must be a scalar' });
    model.modules.push({ ...document, name, status, kind: typeof kind === 'string' ? kind : '', uses: references(document, 'uses', true) });
    collect(document, name, 'module');
  }
  for (const relative of files('flows')) {
    const document = read(relative);
    if (!document) continue;
    const name = basename(relative, '.md');
    const steps = parseSteps(document);
    const modules = [...new Set(steps.filter(step => step.type === 'transfer').flatMap(step => [step.from, step.to]))].sort();
    model.flows.push({ ...document, name, steps, modules });
    collect(document, name, 'flow');
  }
  for (const relative of files('slices')) {
    const document = read(relative);
    if (!document) continue;
    const name = basename(relative, '.md');
    const moduleRefs = references(document, 'modules');
    model.slices.push({ ...document, name, moduleRefs, modules: moduleRefs.map(ref => ref.name), done: Boolean(section(document, 'Report')?.text) });
    collect(document, name, 'slice');
  }
  const decisions = read('decisions.md', true);
  if (decisions) {
    model.decisions = parseDecisions(decisions);
    collect(decisions, 'decisions', 'decisions');
  }
  return model;
}
