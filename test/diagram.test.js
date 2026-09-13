import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
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

test('the bundled flowchart parser accepts keyword modules with distinct labels and shared map and route ids', async () => {
  const reserved = ['end', 'subgraph', 'graph', 'flowchart', 'direction', 'classDef', 'class', 'style', 'linkStyle', 'acc_title', 'acc_descr', 'interpolate', '_self', '_blank', '_parent', '_top'];
  const names = [...reserved, ...reserved.map(name => `module_${name}`), 'a-b', 'a_b', 'a_b_2', 'default'];
  const sample = {
    modules: names.map((name, index) => ({ name, status: 'agreed', kind: 'library', uses: index ? [{ name: names[index - 1], label: 'uses' }] : [] })),
    flows: [{ name: 'keywords', modules: names, steps: names.slice(1).map((name, index) => ({ number: index + 1, type: 'transfer', from: name, to: names[index], text: 'uses' })) }],
  };
  const ids = nodeIds(sample);
  const context = {};
  runInNewContext(readFileSync(new URL('../runtime/vendor/mermaid.min.js', import.meta.url), 'utf8'), context);
  context.mermaid.initialize({ startOnLoad: false });
  const parsed = await context.mermaid.mermaidAPI.getDiagramFromText('flowchart LR\n');
  parsed.db.sanitizeText = text => text;
  assert.equal(new Set(Object.values(ids)).size, names.length);
  for (const flow of [null, sample.flows[0]]) {
    parsed.db.clear();
    parsed.getParser().parse(diagram(sample, flow, ids));
    const vertices = parsed.db.getVertices();
    assert.equal(vertices.size, names.length);
    for (const name of names) {
      const vertex = vertices.get(ids[name]);
      assert.equal(vertex.text, name);
      assert.ok(vertex.classes.includes('agreed'));
      assert.ok(vertex.domId.startsWith(`flowchart-${ids[name]}-`));
    }
    assert.deepEqual(Array.from(parsed.db.getEdges(), edge => [edge.start, edge.end]).sort(), names.slice(1).map((name, index) => [ids[name], ids[names[index]]]).sort());
  }
});
