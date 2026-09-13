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
  assert.match(diagram(broken), /^module_ghost\["ghost \(missing\)"\]:::missing$/m);
  assert.match(diagram(broken, broken.flows[0]), /^module_absent\["absent \(missing\)"\]:::missing$/m);
  assert.doesNotMatch(diagram(broken, broken.flows[0]), /repeat until/);
});

test('unknown kinds stay rectangles, reserved names render, and distinct modules never collapse to one id', () => {
  const sample = { modules: ['a-b', 'a_b', 'a_b_2', 'end', 'module_end', 'subgraph'].map(name => ({ name, status: 'proposed', kind: 'constructor', uses: [] })) };
  sample.modules[0].uses.push({ name: 'a_b', label: '' });
  const ids = nodeIds(sample);
  assert.equal(new Set(Object.values(ids)).size, sample.modules.length);
  assert.equal(ids['a-b'], 'module_a_b');
  assert.equal(ids.a_b, 'module_a_b_2');
  assert.equal(ids.a_b_2, 'module_a_b_2_2');
  assert.equal(ids.end, 'module_end');
  assert.equal(ids.module_end, 'module_module_end');
  assert.ok(diagram(sample).includes(`${ids['a-b']} --> ${ids.a_b}`));
  assert.ok(diagram(sample).includes('module_end["end"]:::proposed'));
  assert.ok(diagram(sample).includes('module_subgraph["subgraph"]:::proposed'));
  const focused = { modules: sample.modules.filter(module => module.name === 'a_b') };
  assert.match(diagram(focused, null, ids), /^module_a_b_2\["a_b"\]:::proposed$/m);
});

test('the bundled flowchart parser accepts keyword declarations and edge endpoints across module shapes', async t => {
  const keywords = ['end', 'subgraph', 'graph', 'flowchart', 'direction', 'classDef', 'class', 'style', 'linkStyle', 'acc_title', 'acc_descr', 'interpolate', '_self', '_blank', '_parent', '_top', 'href', 'call', 'click', 'accDescr', 'accTitle'];
  const names = [...keywords, ...keywords.map(name => `module_${name}`), 'a-b', 'a_b', 'a_b_2', 'default'];
  const shapes = { agent: 'subroutine', human: 'trapezoid', tool: 'round', trigger: 'odd', service: 'stadium', library: 'square', store: 'cylinder', external: 'hexagon', constructor: 'square' };
  const context = {};
  runInNewContext(readFileSync(new URL('../runtime/vendor/mermaid.min.js', import.meta.url), 'utf8'), context);
  context.mermaid.initialize({ startOnLoad: false });
  const parsed = await context.mermaid.mermaidAPI.getDiagramFromText('flowchart LR\n');
  parsed.db.sanitizeText = text => text;
  for (const [kind, shape] of Object.entries(shapes)) {
    await t.test(kind, () => {
      const next = index => names[(index + 1) % names.length];
      const sample = {
        modules: names.map((name, index) => ({ name, status: 'agreed', kind, uses: [{ name: next(index), label: '' }, { name: next(index), label: 'uses' }] })),
        flows: [{ name: 'keywords', modules: names, steps: names.map((name, index) => ({ number: index + 1, type: 'transfer', from: name, to: next(index), text: 'uses' })) }],
      };
      const ids = nodeIds(sample);
      assert.equal(new Set(Object.values(ids)).size, names.length);
      for (const flow of [null, sample.flows[0]]) {
        parsed.db.clear();
        parsed.getParser().parse(diagram(sample, flow));
        const vertices = parsed.db.getVertices();
        assert.equal(vertices.size, names.length);
        for (const name of names) {
          const vertex = vertices.get(ids[name]);
          assert.equal(vertex.text, name);
          assert.equal(vertex.type, shape);
          assert.ok(vertex.classes.includes('agreed'));
          assert.ok(vertex.domId.startsWith(`flowchart-${ids[name]}-`));
        }
        const edges = names.flatMap((name, index) => (flow ? [`${index + 1} uses`] : ['', 'uses']).map(text => [ids[name], ids[next(index)], text]));
        assert.deepEqual(Array.from(parsed.db.getEdges(), edge => [edge.start, edge.end, edge.text]).sort(), edges.sort());
      }
    });
  }
});
