import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { diagram, nodeIds } from '../runtime/src/diagram.js';

const page = readFileSync(new URL('../runtime/src/viewer/page.html', import.meta.url), 'utf8');
const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
const flush = () => new Promise(resolve => setImmediate(resolve));

function snapshot(responsibility) {
  return {
    name: 'Workshop', findings: [], flows: [], slices: [],
    modules: [{ name: 'worker', status: 'built', uses: [], file: 'design/modules/worker.md',
      sections: [{ title: 'Responsibility', text: responsibility }] }],
  };
}

// Only the DOM surface used by a module view is needed for this connection test.
function element() {
  return {
    children: [], innerHTML: '', textContent: '', scrollTop: 0,
    append(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    classList: { toggle() {} }, lastElementChild: { textContent: '' },
  };
}

test('the first live connection refreshes changes made after the initial model request', async () => {
  const elements = new Map(['content', 'system-name', 'counts', 'primary-nav', 'module-nav', 'connection', '.sidebar'].map(id => [id, element()]));
  const document = {
    getElementById: id => elements.get(id),
    querySelector: selector => elements.get(selector),
    createElement: element,
  };
  const window = { scrollX: 0, scrollY: 0, scrollTo(x, y) { this.scrollX = x; this.scrollY = y; } };
  const location = { hash: '#module/worker' };
  const streams = [];
  let current = snapshot('Before the live connection.');
  class EventSource {
    constructor() { streams.push(this); }
    close() {}
  }
  runInNewContext(script, {
    document, window, location, EventSource,
    fetch: async () => ({ ok: true, json: async () => structuredClone(current) }),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, setTimeout, clearTimeout,
  });
  const rendered = () => elements.get('content').children.map(child => child.innerHTML).join('\n');
  await flush();
  assert.match(rendered(), /Before the live connection\./);

  // A file changed while the first event-stream handshake was still pending.
  current = snapshot('Changed before the live connection opened.');
  window.scrollY = 120;
  streams[0].onopen();
  await flush();
  assert.match(rendered(), /Changed before the live connection opened\./);
  assert.equal(location.hash, '#module/worker');
  assert.equal(window.scrollY, 120);

  current = snapshot('A later live edit.');
  streams[0].onmessage();
  await flush();
  assert.match(rendered(), /A later live edit\./);
});

test('map nodes with escaped and colliding ids navigate to the original module names', async () => {
  const names = ['interpolate', 'module_interpolate', '_self', 'module__self', '_blank', '_parent', '_top', 'href', 'call', 'click', 'accDescr', 'a-b', 'a_b', 'a_b_2', 'café'];
  const model = { ...snapshot('Inspect the selected module.'), modules: names.map(name => ({ ...snapshot('').modules[0], name })) };
  model.nodeIds = nodeIds(model);
  model.map = diagram(model);
  model.focusedNames = names;
  model.focusedMap = model.map;
  const nodes = names.map((name, index) => ({
    id: `kanon-graph-1-flowchart-${model.nodeIds[name]}-${index}`, attributes: {}, events: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(type, handler) { this.events[type] = handler; },
  }));
  const svg = {
    style: {}, getBBox: () => ({ x: 0, y: 0, width: 400, height: 200 }),
    setAttribute() {}, removeAttribute() {}, querySelectorAll: () => nodes,
  };
  const makeElement = () => ({ ...element(), querySelector: selector => selector === 'svg' ? svg : null, insertAdjacentHTML() {} });
  const elements = new Map(['content', 'system-name', 'counts', 'primary-nav', 'module-nav', 'connection', '.sidebar'].map(id => [id, makeElement()]));
  const mermaid = { initialize() {}, render: async () => ({ svg: '<svg></svg>' }) };
  const location = { hash: '#overview' };
  runInNewContext(script, {
    document: {
      getElementById: id => elements.get(id), querySelector: selector => elements.get(selector),
      createElement: makeElement, fonts: { ready: Promise.resolve() },
    },
    window: { mermaid, scrollX: 0, scrollY: 0, scrollTo() {} }, mermaid, location,
    EventSource: class {}, fetch: async () => ({ ok: true, json: async () => model }),
    getComputedStyle: () => ({ fontFamily: 'sans-serif' }),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, setTimeout, clearTimeout,
  });
  await flush();
  for (const [index, node] of nodes.entries()) {
    assert.equal(node.attributes.role, 'link');
    assert.equal(node.attributes['aria-label'], `Inspect ${names[index]}`);
    node.events.click();
    assert.equal(location.hash, `module/${encodeURIComponent(names[index])}`);
    for (const key of ['Enter', ' ']) {
      location.hash = '#overview';
      let prevented = false;
      node.events.keydown({ key, preventDefault() { prevented = true; } });
      assert.equal(location.hash, `module/${encodeURIComponent(names[index])}`);
      assert.equal(prevented, true);
    }
  }
});

test('overlapping live renders preserve scroll and let the latest model and route win', async t => {
  for (const changeRoute of [false, true]) {
    await t.test(changeRoute ? 'explicit navigation resets page scroll' : 'live updates retain page scroll', async () => {
      let maxX = 0, maxY = 0;
      const window = { scrollX: 0, scrollY: 0, scrollTo(x, y) { this.scrollX = Math.min(x, maxX); this.scrollY = Math.min(y, maxY); } };
      const sidebar = element();
      const svg = {
        style: {}, getBBox: () => ({ x: 0, y: 0, width: 400, height: 2000 }),
        setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [],
      };
      const makeElement = () => {
        let html = '';
        return {
          ...element(),
          get innerHTML() { return html; },
          set innerHTML(value) {
            html = value;
            if (this.className === 'diagram') { maxX = 200; maxY = 2000; }
            if (this.id === 'module-nav') sidebar.scrollTop = 0;
          },
          querySelector: selector => selector === 'svg' ? svg : null,
          insertAdjacentHTML(position, value) { this.innerHTML += value; },
        };
      };
      const elements = new Map(['content', 'system-name', 'counts', 'primary-nav', 'module-nav', 'connection'].map(id => {
        const node = makeElement(); node.id = id; return [id, node];
      }));
      elements.set('.sidebar', sidebar);
      elements.get('content').replaceChildren = function () {
        this.children = []; maxX = 0; maxY = 0;
        window.scrollTo(window.scrollX, window.scrollY);
      };
      const flowModel = label => {
        const latest = snapshot(label);
        latest.name = label;
        latest.modules[0].uses = [{ name: 'worker', label }];
        latest.flows = [{ name: 'Delivery', modules: ['worker'], sections: [{ title: 'Scenario', text: label }],
          steps: [{ number: 1, type: 'transfer', from: 'worker', to: 'worker', text: label }] }];
        latest.nodeIds = nodeIds(latest);
        latest.map = diagram(latest);
        latest.routes = { Delivery: diagram(latest, latest.flows[0]) };
        return latest;
      };
      const renders = [], streams = [], listeners = {};
      const mermaid = { initialize() {}, render: (id, source) => new Promise(resolve => {
        renders.push({ source, finish: () => resolve({ svg: '<svg></svg>' }) });
      }) };
      window.mermaid = mermaid;
      const location = { hash: '#flows' };
      let current = flowModel('Initial design');
      runInNewContext(script, {
        document: {
          getElementById: id => elements.get(id), querySelector: selector => elements.get(selector),
          createElement: makeElement, fonts: { ready: Promise.resolve() },
        },
        window, mermaid, location,
        EventSource: class { constructor() { streams.push(this); } },
        fetch: async () => ({ ok: true, json: async () => structuredClone(current) }),
        getComputedStyle: () => ({ fontFamily: 'sans-serif' }),
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        addEventListener: (type, handler) => { listeners[type] = handler; }, setTimeout, clearTimeout,
      });
      const update = async label => { current = flowModel(label); streams[0].onmessage(); await flush(); };
      const rendered = node => [node.innerHTML, ...node.children.map(rendered)].join('\n');
      await flush();
      assert.equal(renders.length, 1);
      renders[0].finish();
      await flush();
      window.scrollTo(80, 700); sidebar.scrollTop = 190;

      await update('First edit');
      assert.equal(renders.length, 2);
      assert.deepEqual([window.scrollX, window.scrollY, sidebar.scrollTop], [0, 0, 0]);
      await update('Second edit');
      if (changeRoute) { location.hash = '#overview'; listeners.hashchange(); }
      await update('Latest edit');
      renders[1].finish();
      await flush();
      assert.equal(renders.length, 3);
      assert.equal(renders[2].source, changeRoute ? current.map : current.routes.Delivery);
      renders[2].finish();
      await flush();
      assert.equal(elements.get('system-name').textContent, 'Latest edit');
      assert.equal(location.hash, changeRoute ? '#overview' : '#flows');
      assert.doesNotMatch(rendered(elements.get('content')), /First edit|Second edit|diagram-error/);
      assert.deepEqual([window.scrollX, window.scrollY], changeRoute ? [0, 0] : [80, 700]);
      assert.equal(sidebar.scrollTop, 190);

      window.scrollTo(40, 300); sidebar.scrollTop = 80;
      await update('Independent edit');
      assert.equal(renders.length, 4);
      renders[3].finish();
      await flush();
      assert.equal(elements.get('system-name').textContent, 'Independent edit');
      assert.deepEqual([window.scrollX, window.scrollY, sidebar.scrollTop], [40, 300, 80]);
    });
  }
});
