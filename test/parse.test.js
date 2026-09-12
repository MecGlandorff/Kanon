import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDesign, parseDocument, section } from '../runtime/src/parse.js';

const clean = fileURLToPath(new URL('fixtures/clean/design', import.meta.url));

test('frontmatter accepts scalars, quoted commas, inline lists, and both block list forms', () => {
  const doc = parseDocument('---\nname: "Workshop"\nkind: agent\nuses: [queue, "store, primary", cache: read]\nempty: []\nlabels:\n  - plain\n  - queue: "read: then write"\n  - \'it\'\'s useful\'\n---\n## Responsibility\nDo work.\n', 'module.md');
  assert.deepEqual(doc.frontmatter, { name: 'Workshop', kind: 'agent', uses: ['queue', 'store, primary', { cache: 'read' }], empty: [], labels: ['plain', { queue: 'read: then write' }, "it's useful"] });
  assert.deepEqual(doc.listLines.labels, [7, 8, 9]);
  assert.equal(section(doc, 'Responsibility').line, 11);
  assert.equal(section(doc, 'Responsibility').text, 'Do work.');
  assert.deepEqual(doc.problems, []);
});

test('unsupported lines have exact locations and valid content survives', () => {
  const doc = parseDocument('---\nstatus: agreed\nnested:\n    child: no\nuses: [queue]\nthing: {nested: no}\n---\n## Responsibility\nStill here.\n', 'design/modules/a.md');
  assert.deepEqual(doc.problems.map(item => [item.file, item.line]), [['design/modules/a.md', 4], ['design/modules/a.md', 6]]);
  assert.deepEqual(doc.frontmatter.uses, ['queue']);
  assert.equal(section(doc, 'Responsibility').text, 'Still here.');
});

test('CRLF, missing frontmatter delimiter, and invalid list syntax are handled without losing sections', () => {
  assert.equal(parseDocument('## Goal\r\nHello\r\n', 'a').sections[0].text, 'Hello');
  const unclosed = parseDocument('---\nstatus: agreed\n## Responsibility\nHello\n', 'a');
  assert.deepEqual(unclosed.problems, [{ file: 'a', line: 1, message: 'unclosed frontmatter' }]);
  assert.equal(section(unclosed, 'Responsibility').text, 'Hello');
  for (const value of ['[a,]', '[a', '["a, b]', '|', '{a: b}', '&alias']) {
    assert.equal(parseDocument(`---\nuses: ${value}\n---\n`, 'a').problems.length, 1, value);
  }
});

test('parse the complete model, question owners and blocks, flow participants and decisions', () => {
  const model = parseDesign(clean);
  assert.deepEqual(model.problems, []);
  assert.equal(model.name, 'Parcel workshop');
  assert.deepEqual(model.modules.map(module => module.name), ['operator', 'queue', 'remote', 'worker']);
  assert.deepEqual(model.questions, [
    { owner: 'worker', ownerType: 'module', file: 'design/modules/worker.md', line: 17, checked: false, text: 'What is the conservative retry delay?', blocks: [] },
    { owner: 'worker', ownerType: 'module', file: 'design/modules/worker.md', line: 18, checked: true, text: 'Must identifiers survive retries?', blocks: ['first-parcel'] },
  ]);
  assert.deepEqual(model.flows[0].modules, ['operator', 'queue', 'worker']);
  assert.equal(model.flows[0].steps[1].fanOut, 8);
  assert.equal(model.flows[0].steps[2].fromStep, 1);
  assert.equal(model.slices[0].done, false);
  assert.deepEqual(model.decisions[1].scope, ['worker', 'queue']);
  assert.equal(model.decisions[1].supersedes, 'D-000');
});

test('optional files, defaults, invalid steps, multiple blockers and a completed report', t => {
  const root = mkdtempSync(join(tmpdir(), 'kanon-parse-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const design = join(root, 'design');
  mkdirSync(design);
  assert.equal(parseDesign(design).name, root.split(/[\\/]/).at(-1));
  assert.deepEqual(parseDesign(design).modules, []);
  for (const folder of ['modules', 'flows', 'slices']) mkdirSync(join(design, folder));
  writeFileSync(join(design, 'modules', 'a.md'), '## Responsibility\nA\n## Open questions\n- [ ] Q: Choose. (blocks: one, two)\n');
  writeFileSync(join(design, 'flows', 'f.md'), '## Steps\n1. a -> a: start\ninvalid\n2. a -> a x2: continue\n4. a -> a: skipped number\n3. repeat from 1 until done\n');
  writeFileSync(join(design, 'slices', 'one.md'), '---\nmodules:\n  - a\n---\n## Report\nBuilt and verified.\n');
  const model = parseDesign(design);
  assert.equal(model.modules[0].status, 'proposed');
  assert.equal(model.slices[0].done, true);
  assert.deepEqual(model.questions[0].blocks, ['one', 'two']);
  assert.deepEqual(model.problems.map(item => item.line), [3, 5]);
  assert.deepEqual(model.flows[0].steps.map(step => step.number), [1, 2, 3]);
  assert.throws(() => parseDesign(join(root, 'missing')), /design folder not found/);
});
