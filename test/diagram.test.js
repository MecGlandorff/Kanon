import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDesign } from '../runtime/src/parse.js';
import { diagram } from '../runtime/src/diagram.js';

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
