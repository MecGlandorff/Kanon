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

test('public Mermaid parsing preserves literal design labels without interpreting their syntax', async t => {
  const context = {};
  runInNewContext(readFileSync(new URL('../runtime/vendor/mermaid.min.js', import.meta.url), 'utf8'), context);
  const { mermaid } = context;
  const settings = { startOnLoad: false, theme: 'default', wrap: false, flowchart: { curve: 'basis' } };
  mermaid.initialize(settings);
  const empty = await mermaid.mermaidAPI.getDiagramFromText('flowchart LR\n');
  Object.getPrototypeOf(empty.db).sanitizeText = text => text;
  const rawDirective = `flowchart LR\ncontrol["before %%{init: {'theme': 'dark'}}%% after"]\n`;
  assert.equal((await mermaid.parse(rawDirective)).config.theme, 'dark');
  assert.equal(mermaid.mermaidAPI.getConfig().theme, 'dark');
  assert.equal((await mermaid.mermaidAPI.getDiagramFromText(rawDirective)).db.getVertices().get('control').text, 'before  after');

  const literalText = text => text.replace(/\uFB02\u00B0(\u00B0?)(\w+)\u00B6\u00DF/g, (entity, numeric, code) =>
    numeric ? String.fromCodePoint(Number(code)) : ({ quot: '"', lt: '<', gt: '>', amp: '&' }[code] ?? entity));
  const labels = [
    ['init', "before %%{init: {'theme': 'dark'}}%% after"],
    ['initialize', "%%{initialize: {'flowchart': {'curve': 'linear'}}}%%"],
    ['wrap', '%%{wrap}%%'],
    ['percent and entities', '50% %% #37; &#37; &amp; #quot; " < > |'],
    ['entity-like directive', "#37;#37;{init: {'theme': 'dark'}}#37;#37;"],
    ['backticks', '`job` request'],
    ['Markdown delimiters', '`**job**`'],
    ['style percent', 'style:50%'],
    ['classDef percent', 'classDef:50%'],
    ['style entities', 'style:#37; &#37; &amp; #quot;'],
    ['classDef entities', 'classDef:#37; &#37; &amp; #quot;'],
    ['mixed syntax', "`style:50%` %%{init: {'theme': 'dark'}}%% #96; &#58;"],
    ['ordinary', 'an ordinary label'],
  ];
  for (const [name, label] of labels) {
    await t.test(name, async () => {
      mermaid.initialize(settings);
      const sample = {
        modules: [
          { name: 'a', status: 'agreed', kind: 'library', uses: [{ name: 'b', label }] },
          { name: 'b', status: 'agreed', kind: 'library', uses: [] },
          { name: label, status: 'agreed', kind: 'library', uses: [] },
        ],
        flows: [{ name: 'route', modules: ['a', 'b'], steps: [
          { number: 1, type: 'transfer', from: 'a', to: 'b', text: label },
          { number: 2, type: 'transfer', from: 'b', to: 'a', text: 'ordinary transfer' },
          { number: 3, type: 'repeat', fromStep: 1, text: label },
        ] }],
      };
      const ids = nodeIds(sample);
      for (const flow of [null, sample.flows[0]]) {
        const source = diagram(sample, flow);
        const result = await mermaid.parse(source);
        assert.equal(result.diagramType, 'flowchart-v2');
        assert.deepEqual(Object.keys(result.config), []);
        const config = mermaid.mermaidAPI.getConfig();
        assert.equal(config.theme, 'default');
        assert.equal(config.wrap, false);
        assert.equal(config.flowchart.curve, 'basis');
        const parsed = await mermaid.mermaidAPI.getDiagramFromText(source);
        assert.equal(parsed.db.getVertices().size, 3);
        assert.equal(parsed.db.getVertices().get(ids.a).text, 'a');
        assert.equal(literalText(parsed.db.getVertices().get(ids[label]).text), label);
        assert.deepEqual(Array.from(parsed.db.getEdges(), edge => literalText(edge.text)), flow
          ? [`1 ${label}`, '2 ordinary transfer', `3 repeat until ${label}`]
          : [label]);
      }
    });
  }
});
