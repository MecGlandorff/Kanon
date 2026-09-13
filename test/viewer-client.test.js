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

function transport() {
  const streams = [], requests = [];
  class EventSource {
    constructor(url) { this.url = url; this.listeners = {}; this.closed = false; streams.push(this); }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    emit(type, data) { this[`on${type}`]?.({ data }); this.listeners[type]?.({ data }); }
    sendModel(model) { this.emit('model', JSON.stringify(model)); }
    close() { this.closed = true; }
  }
  return { streams, requests, EventSource, fetch: url => { requests.push(url); return new Promise(() => {}); } };
}

test('six live windows render initial, updated, and reconnected stream models without model requests', async () => {
  const clients = Array.from({ length: 6 }, () => {
    const elements = new Map(['content', 'system-name', 'counts', 'primary-nav', 'module-nav', 'connection', '.sidebar'].map(id => [id, element()]));
    const window = { scrollX: 0, scrollY: 0, scrollTo(x, y) { this.scrollX = x; this.scrollY = y; } };
    const location = { hash: '#module/worker' };
    const network = transport();
    let retry;
    runInNewContext(script, {
      document: { getElementById: id => elements.get(id), querySelector: selector => elements.get(selector), createElement: element },
      window, location, EventSource: network.EventSource, fetch: network.fetch,
      matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {},
      setTimeout: callback => { retry = callback; }, clearTimeout: () => { retry = undefined; },
    });
    return { ...network, elements, window, location, retry: () => { const callback = retry; retry = undefined; callback(); },
      rendered: () => elements.get('content').children.map(child => child.innerHTML).join('\n') };
  });
  await flush();
  let current = snapshot('Changed before the live connection opened.');
  for (const [index, client] of clients.entries()) {
    client.window.scrollY = 120 + index;
    client.elements.get('.sidebar').scrollTop = 60 + index;
    assert.equal(client.streams.length, 1);
    assert.equal(client.streams[0].url, '/events');
    client.streams[0].emit('open');
    client.streams[0].sendModel(current);
  }
  await flush();
  for (const [index, client] of clients.entries()) {
    assert.match(client.rendered(), /Changed before the live connection opened\./);
    assert.equal(client.location.hash, '#module/worker');
    assert.equal(client.window.scrollY, 120 + index);
    assert.equal(client.elements.get('.sidebar').scrollTop, 60 + index);
    assert.equal(client.elements.get('connection').lastElementChild.textContent, 'Live');
    assert.deepEqual(client.requests, []);
  }

  current = snapshot('A later live edit.\n\n<strong>café & labels</strong>');
  for (const client of clients) {
    client.streams[0].emit('message', 'modules/worker.md');
    client.streams[0].sendModel(current);
  }
  await flush();
  for (const client of clients) {
    assert.match(client.rendered(), /A later live edit\./);
    assert.match(client.rendered(), /&lt;strong&gt;café &amp; labels&lt;\/strong&gt;/);
    assert.doesNotMatch(client.rendered(), /<strong>café/);
    assert.deepEqual(client.requests, []);
    client.streams[0].emit('error');
    assert.equal(client.streams[0].closed, true);
    assert.equal(client.elements.get('connection').lastElementChild.textContent, 'Reconnecting…');
  }

  current = snapshot('Changed while disconnected.');
  for (const client of clients) {
    client.retry();
    assert.equal(client.streams.length, 2);
    client.streams[1].emit('open');
    client.streams[1].sendModel(current);
  }
  await flush();
  for (const [index, client] of clients.entries()) {
    assert.match(client.rendered(), /Changed while disconnected\./);
    assert.equal(client.location.hash, '#module/worker');
    assert.equal(client.window.scrollY, 120 + index);
    assert.equal(client.elements.get('.sidebar').scrollTop, 60 + index);
    assert.equal(client.elements.get('connection').lastElementChild.textContent, 'Live');
    assert.deepEqual(client.requests, []);
  }
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
  const network = transport();
  runInNewContext(script, {
    document: {
      getElementById: id => elements.get(id), querySelector: selector => elements.get(selector),
      createElement: makeElement, fonts: { ready: Promise.resolve() },
    },
    window: { mermaid, scrollX: 0, scrollY: 0, scrollTo() {} }, mermaid, location,
    EventSource: network.EventSource, fetch: network.fetch,
    getComputedStyle: () => ({ fontFamily: 'sans-serif' }),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, setTimeout, clearTimeout,
  });
  network.streams[0].sendModel(model);
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
  assert.deepEqual(network.requests, []);
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
      const renders = [], listeners = {};
      const network = transport();
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
        EventSource: network.EventSource, fetch: network.fetch,
        getComputedStyle: () => ({ fontFamily: 'sans-serif' }),
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        addEventListener: (type, handler) => { listeners[type] = handler; }, setTimeout, clearTimeout,
      });
      const update = async label => { current = flowModel(label); network.streams[0].sendModel(current); await flush(); };
      const rendered = node => [node.innerHTML, ...node.children.map(rendered)].join('\n');
      network.streams[0].sendModel(current);
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
      assert.deepEqual(network.requests, []);
    });
  }
});
