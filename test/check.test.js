import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseDesign } from '../runtime/src/parse.js';
import { check } from '../runtime/src/check.js';

const fixture = name => fileURLToPath(new URL(`fixtures/${name}/`, import.meta.url));
const cli = fileURLToPath(new URL('../runtime/cli.js', import.meta.url));

test('each of the seven error categories appears once, in the specified order with source lines', () => {
  const findings = check(parseDesign(`${fixture('errors')}design`));
  assert.deepEqual(findings.map(({ file, line, message }) => [file, line, message]), [
    ['design/modules/worker.md', 6, 'unsupported frontmatter line'],
    ['design/modules/worker.md', 4, 'uses unknown module "ghost"'],
    ['design/modules/worker.md', 8, 'empty Responsibility'],
    ['design/flows/retry.md', 5, 'flow uses unknown module "absent"'],
    ['design/slices/delivery.md', 2, 'module "worker" is proposed, not agreed'],
    ['design/modules/worker.md', 14, 'open question blocks slice "delivery": Decide the retry bound.'],
    ['design/flows/retry.md', 6, 'repeat from 2 must refer to an earlier step'],
  ]);
  const run = spawnSync(process.execPath, [cli, 'check'], { cwd: fixture('errors'), encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.equal(run.stderr, '');
  assert.equal(run.stdout, findings.map(item => `error  ${item.file}:${item.line}  ${item.message}\n`).join('') + '7 errors\n');
});

test('a clean fixture prints ok and exits zero, including a proposed module outside any slice', () => {
  assert.deepEqual(check(parseDesign(`${fixture('clean')}design`)), []);
  assert.equal(execFileSync(process.execPath, [cli, 'check'], { cwd: fixture('clean'), encoding: 'utf8' }), 'ok: 4 modules, 1 flows, 1 slices\n');
});

test('unknown slice modules and absent Responsibility use their declaration lines', () => {
  const model = parseDesign(`${fixture('clean')}design`);
  model.slices[0].moduleRefs.push({ name: 'absent', line: 2 });
  model.modules[0].sections = [];
  assert.deepEqual(check(model).map(item => [item.line, item.message]), [[1, 'empty Responsibility'], [2, 'slice includes unknown module "absent"']]);
});

test('CLI rejects unknown commands, options, flows, slices and invalid ports without a stack trace', () => {
  for (const args of [['unknown'], ['check', '--flow', 'x'], ['diagram', '--flow', 'absent'], ['handoff', '../escape'], ['view', '--port', '0'], ['view', '--port', '65536'], ['view', '--port', 'abc']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: fixture('clean'), encoding: 'utf8' });
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /^kanon:/);
    assert.doesNotMatch(result.stderr, /\n\s+at /);
  }
});
