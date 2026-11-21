import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseDesign } from '../runtime/src/parse.js';
import { check } from '../runtime/src/check.js';
import { writeHandoff } from '../runtime/src/handoff.js';

const cli = fileURLToPath(new URL('../runtime/cli.js', import.meta.url));
function fixture(t, name = 'clean') {
  const root = mkdtempSync(join(tmpdir(), 'kanon-handoff-'));
  cpSync(new URL(`fixtures/${name}/`, import.meta.url), root, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const stable = text => text.split('\n').filter(line => !line.startsWith('Generated: ') && !line.startsWith('Git commit: ')).join('\n');

test('blocked handoff exits one and does not create even the output directory', t => {
  const root = fixture(t, 'errors');
  const result = spawnSync(process.execPath, [cli, 'handoff', 'delivery'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /open question blocks slice/);
  assert.equal(existsSync(join(root, 'design', 'handoffs')), false);
});

test('buildable handoff matches its golden and includes only relevant external interfaces and decisions', t => {
  const root = fixture(t);
  const original = readFileSync(join(root, 'design', 'modules', 'worker.md'), 'utf8');
  const result = spawnSync(process.execPath, [cli, 'handoff', 'first-parcel'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const packet = readFileSync(result.stdout.trim(), 'utf8');
  assert.equal(stable(packet), stable(readFileSync(new URL('golden/handoff.md', import.meta.url), 'utf8')));
  assert.ok(packet.includes(original));
  assert.doesNotMatch(packet, /private storage detail|D-003/);
  assert.equal(readFileSync(join(root, 'design', 'modules', 'worker.md'), 'utf8'), original);
});

test('handoff keeps headings inside code examples and the constraints that follow them', t => {
  const design = join(fixture(t), 'design');
  for (const fence of ['```', '~~~']) {
    const constraints = [
      'Use this receipt format:',
      fence + 'markdown',
      '## Receipt',
      fence,
      'Keep the original currency.',
    ].join('\n');
    writeFileSync(join(design, 'system.md'), `## Constraints\n${constraints}\n\n## Notes\nDraft notes.\n`);
    const result = writeHandoff(parseDesign(design), 'first-parcel');
    assert.deepEqual(result.findings, []);
    const packet = readFileSync(result.path, 'utf8');
    assert.ok(packet.includes(`## Constraints\n\n${constraints}\n\n## Modules in scope`));
  }
});

test('a slice can be drafted before its goal and acceptance criteria are ready for handoff', t => {
  const design = join(fixture(t), 'design');
  const slice = join(design, 'slices', 'first-parcel.md');
  for (const [body, title, line] of [
    ['## Acceptance criteria\nThe receipt keeps its currency.', 'Goal', 1],
    ['## Goal\nPrint a receipt.\n## Acceptance criteria\n  ', 'Acceptance criteria', 6],
  ]) {
    writeFileSync(slice, `---\nmodules: [worker]\n---\n${body}\n`);
    const model = parseDesign(design);
    assert.deepEqual(check(model), []);
    const result = writeHandoff(model, 'first-parcel');
    assert.deepEqual(result.findings, [{
      level: 'error', file: 'design/slices/first-parcel.md', line,
      message: `Add text under "## ${title}" before handoff.`,
    }]);
    assert.equal(existsSync(join(design, 'handoffs')), false);
  }
});

test('unrelated broken slices and questions that block other slices do not block this handoff', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'design', 'slices', 'later.md'), '---\nmodules: [remote, missing]\n---\n## Goal\nLater\n');
  const file = join(root, 'design', 'modules', 'worker.md');
  writeFileSync(file, readFileSync(file, 'utf8') + '- [ ] Another decision. (blocks: later)\n');
  const result = writeHandoff(parseDesign(join(root, 'design')), 'first-parcel');
  assert.deepEqual(result.findings, []);
  assert.ok(existsSync(result.path));
});

test('a question outside the slice can block it and shared parser errors also block', t => {
  const root = fixture(t);
  const file = join(root, 'design', 'system.md');
  writeFileSync(file, readFileSync(file, 'utf8') + '\n## Open questions\n- [ ] Choose retention. (blocks: first-parcel)\n');
  assert.equal(writeHandoff(parseDesign(join(root, 'design')), 'first-parcel').findings.length, 1);
  writeFileSync(file, '---\nunsupported!\n---\n## Constraints\nKeep data local.\n');
  assert.equal(writeHandoff(parseDesign(join(root, 'design')), 'first-parcel').findings.length, 1);
  assert.equal(existsSync(join(root, 'design', 'handoffs')), false);
});

test('handoff refuses symlink output folders and files rather than changing other paths', { skip: process.platform === 'win32' }, t => {
  const root = fixture(t);
  const folder = join(root, 'design', 'handoffs');
  symlinkSync(root, folder, 'dir');
  assert.throws(() => writeHandoff(parseDesign(join(root, 'design')), 'first-parcel'), /real directory/);
  rmSync(folder);
  const result = writeHandoff(parseDesign(join(root, 'design')), 'first-parcel');
  rmSync(result.path);
  const outside = join(root, 'precious.md');
  writeFileSync(outside, 'unchanged');
  symlinkSync(outside, result.path);
  assert.throws(() => writeHandoff(parseDesign(join(root, 'design')), 'first-parcel'), /must not be a symlink/);
  assert.equal(readFileSync(outside, 'utf8'), 'unchanged');
});
