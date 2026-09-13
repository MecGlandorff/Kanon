import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseDesign } from '../runtime/src/parse.js';
import { check } from '../runtime/src/check.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('templates form a valid starting design without parser problems', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'kanon-templates-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const design = join(temporary, 'design');
  for (const folder of ['modules', 'flows', 'slices']) mkdirSync(join(design, folder), { recursive: true });
  for (const [name, destination] of [['system', 'system.md'], ['module', 'modules/module.md'], ['flow', 'flows/flow.md'], ['slice', 'slices/slice.md'], ['decisions', 'decisions.md']]) cpSync(join(root, 'skills', 'kanon', 'templates', `${name}.md`), join(design, destination));
  assert.deepEqual(check(parseDesign(design)), []);
});

test('the Bash wrapper works from another project and a plugin path containing spaces', { skip: process.platform === 'win32' }, t => {
  const temporary = mkdtempSync(join(tmpdir(), 'kanon package '));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const plugin = join(temporary, 'plugin with spaces');
  cpSync(join(root, 'runtime'), join(plugin, 'runtime'), { recursive: true });
  cpSync(join(root, 'skills'), join(plugin, 'skills'), { recursive: true });
  cpSync(join(root, 'package.json'), join(plugin, 'package.json'));
  const wrapper = join(plugin, 'skills', 'kanon', 'scripts', 'kanon');
  const env = { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}` };
  const run = spawnSync('bash', [wrapper, 'check'], { cwd: join(root, 'test', 'fixtures', 'clean'), encoding: 'utf8', env });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'ok: 4 modules, 1 flows, 1 slices\n');
  const blocked = spawnSync('bash', [wrapper, 'handoff', 'delivery'], { cwd: join(root, 'test', 'fixtures', 'errors'), encoding: 'utf8', env });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stdout, /open question blocks slice/);
});

test('package has no dependency installation and includes both matching host manifests', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  assert.equal(Object.keys(pkg.devDependencies ?? {}).length, 0);
  for (const host of ['claude', 'codex']) {
    const manifest = JSON.parse(readFileSync(join(root, `.${host}-plugin`, 'plugin.json'), 'utf8'));
    assert.equal(manifest.name, 'kanon');
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.skills, './skills/');
  }
});
