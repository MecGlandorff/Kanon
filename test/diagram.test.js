import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDesign } from '../runtime/src/parse.js';
import { diagram, nodeIds } from '../runtime/src/diagram.js';

const model = parseDesign(fileURLToPath(new URL('fixtures/clean/design', import.meta.url)));
test('map and route match reviewed golden files byte for byte', () => {
  assert.equal(diagram(model), readFileSync(new URL('golden/map.mmd', import.meta.url), 'utf8'));
  assert.equal(diagram(model, model.flows[0]), readFileSync(new URL('golden/route.mmd', import.meta.url), 'utf8'));
});

test('missing dependencies and unknown flow participants remain visible', () => {
  const broken = parseDesign(fileURLToPath(new URL('fixtures/errors/design', import.meta.url)));
  assert.match(diagram(broken), /ghost\["ghost \(missing\)"\]:::missing/);
  assert.match(diagram(broken, broken.flows[0]), /absent\["absent \(missing\)"\]:::missing/);
  assert.doesNotMatch(diagram(broken, broken.flows[0]), /repeat until/);
});

test('unknown kinds stay rectangles, reserved names render, and distinct modules never collapse to one id', () => {
  const sample = { modules: ['a-b', 'a_b', 'a_b_2', 'end', 'module_end', 'subgraph'].map(name => ({ name, status: 'proposed', kind: 'constructor', uses: [] })) };
  sample.modules[0].uses.push({ name: 'a_b', label: '' });
  const ids = nodeIds(sample);
  assert.equal(new Set(Object.values(ids)).size, sample.modules.length);
  assert.equal(ids.end, 'module_end');
  assert.equal(ids.module_end, 'module_end_2');
  assert.ok(diagram(sample).includes(`${ids['a-b']} --> ${ids.a_b}`));
  assert.ok(diagram(sample).includes('module_end["end"]:::proposed'));
  assert.ok(diagram(sample).includes('module_subgraph["subgraph"]:::proposed'));
});
