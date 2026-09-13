import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext, SourceTextModule } from 'node:vm';
import { diagram, nodeIds } from '../runtime/src/diagram.js';

const page = readFileSync(new URL('../runtime/src/viewer/page.html', import.meta.url), 'utf8');
const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
const flush = () => new Promise(resolve => setImmediate(resolve));

function runPage(globals, load = async () => {}) {
  const context = createContext(globals);
  const modules = new Map();
  function linkModule(path) {
    if (!modules.has(path)) modules.set(path, (async () => {
      await load(path);
      const module = new SourceTextModule(readFileSync(new URL(`../runtime/src${path}`, import.meta.url), 'utf8'), { context, identifier: path });
      await module.link((specifier, referrer) => linkModule(new URL(specifier, `http://viewer${referrer.identifier}`).pathname));
      return module;
    })());
    return modules.get(path);
  }
  return runInContext(script, context, {
    importModuleDynamically: async path => {
      const module = await linkModule(path);
      await module.evaluate();
      return module;
    },
  });
}

function snapshot(responsibility) {
  return {
    name: 'Workshop', findings: [], flows: [], slices: [],
    modules: [{ name: 'worker', status: 'built', uses: [], file: 'design/modules/worker.md',
      sections: [{ title: 'Responsibility', text: responsibility }] }],
  };
}

function element(tagName = 'div') {
  const node = {
    tagName, children: [], innerHTML: '', ownText: '', scrollTop: 0, style: {}, attributes: {}, listeners: {}, className: '',
    get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); },
    set textContent(value) { this.ownText = String(value); this.innerHTML = ''; this.children = []; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.ownText = ''; this.innerHTML = ''; this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    querySelector(tag) { return descendants(this).find(child => child.tagName === tag) ?? null; },
    click() { if (!this.disabled) this.listeners.click?.(); },
    lastElementChild: { textContent: '' },
  };
  node.classList = { toggle(value, on) {
    const names = new Set(node.className.split(' ').filter(Boolean));
    if (on) names.add(value); else names.delete(value);
    node.className = [...names].join(' ');
  } };
  return node;
}

function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }

function transport({ opened = () => {}, closed = () => {} } = {}) {
  const streams = [], requests = [];
  class EventSource {
    constructor(url) { this.url = url; this.listeners = {}; this.closed = false; streams.push(this); opened(); }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    emit(type, data) { this[`on${type}`]?.({ data }); this.listeners[type]?.({ data }); }
    sendModel(model) { this.emit('model', JSON.stringify(model)); }
    close() { if (!this.closed) { this.closed = true; closed(); } }
  }
  return { streams, requests, EventSource, fetch: url => { requests.push(url); return new Promise(() => {}); } };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function processSnapshot(label) {
  const model = snapshot(label);
  model.name = label;
  model.nodeIds = nodeIds(model);
  model.map = diagram(model);
  model.focusedMap = model.map;
  model.focusedNames = ['worker'];
  model.flows = [
    { name: 'delivery', modules: ['worker'], sections: [], blocks: [{ title: 'Receive work', steps: [1] }, { title: 'Inspect work', steps: [7] }], steps: [
      { number: 1, type: 'transfer', from: 'worker', to: 'worker', text: `Receive: ${label}` },
      { number: 7, type: 'transfer', from: 'worker', to: 'worker', text: 'Inspect the work.', flow: 'inspect' },
    ] },
    { name: 'inspect', modules: ['worker'], sections: [], steps: [{ number: 4, type: 'transfer', from: 'worker', to: 'worker', text: `Inspect: ${label}` }] },
  ];
  return model;
}

function flowClient({ hash = '#module/worker', load, pool = { active: 0 } } = {}) {
  const svg = {
    style: {}, getBBox: () => ({ x: 0, y: 0, width: 400, height: 200 }),
    setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [],
  };
  const makeElement = tag => {
    const node = element(tag);
    const querySelector = node.querySelector.bind(node);
    node.querySelector = selector => selector === 'svg' ? svg : querySelector(selector);
    node.insertAdjacentHTML = (position, html) => { node.innerHTML += html; };
    return node;
  };
  const elements = new Map(['content', 'system-name', 'counts', 'primary-nav', 'module-nav', 'connection', '.sidebar'].map(id => [id, makeElement('div')]));
  elements.get('content').textContent = 'Loading the design…';
  elements.get('connection').lastElementChild.textContent = 'Connecting…';
  const listeners = {};
  const location = {
    get hash() { return hash; },
    set hash(value) { hash = value; queueMicrotask(() => listeners.hashchange?.()); },
  };
  const window = { scrollX: 0, scrollY: 0, scrollTo(x, y) { this.scrollX = x; this.scrollY = y; } };
  const mermaid = { initialize() {}, render: async () => ({ svg: '<svg></svg>' }) };
  window.mermaid = mermaid;
  const network = transport({ opened: () => { pool.active++; }, closed: () => { pool.active--; } });
  let retry;
  const ready = runPage({
    document: {
      getElementById: id => elements.get(id), querySelector: selector => elements.get(selector),
      createElement: makeElement, fonts: { ready: Promise.resolve() },
    },
    window, mermaid, location, EventSource: network.EventSource, fetch: network.fetch,
    getComputedStyle: () => ({ fontFamily: 'sans-serif' }),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (type, callback) => { listeners[type] = callback; },
    setTimeout: callback => { retry = callback; }, clearTimeout: () => { retry = undefined; },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, ResizeObserver: class { observe() {} disconnect() {} },
  }, load);
  return {
    ...network, elements, window, location, ready,
    navigate: hash => { location.hash = hash; },
    unload: () => listeners.beforeunload(),
    retry: () => { const callback = retry; retry = undefined; callback(); },
    control: label => {
      const node = descendants(elements.get('content')).find(child => child.attributes['aria-label'] === label);
      assert.ok(node, `Missing control: ${label}`);
      return node;
    },
  };
}

test('six module/map windows await both flow assets before SSE and keep flow navigation live', async t => {
  for (const first of ['/flow.js', '/viewer/flows.js']) {
    await t.test(`${first} finishes first`, async t => {
      const gates = new Map(['/flow.js', '/viewer/flows.js'].map(path => [path, deferred()]));
      const pool = { active: 0 };
      const imports = [];
      const clients = Array.from({ length: 6 }, (_, index) => flowClient({
        hash: index % 2 ? '#map' : '#module/worker', pool,
        load: path => {
          imports.push({ window: index, path, streams: pool.active });
          if (pool.active >= 6) return new Promise(() => {});
          assert.ok(gates.has(path), `Unexpected asset: ${path}`);
          return gates.get(path).promise;
        },
      }));
      t.after(() => clients.forEach(client => client.unload()));
      await flush();
      assert.equal(pool.active, 0);
      for (let index = 0; index < clients.length; index++) {
        assert.deepEqual(imports.filter(item => item.window === index).map(item => item.path).sort(), ['/flow.js', '/viewer/flows.js']);
      }
      gates.get(first).resolve();
      await flush();
      assert.equal(pool.active, 0);
      gates.get(first === '/flow.js' ? '/viewer/flows.js' : '/flow.js').resolve();
      await Promise.all(clients.map(client => client.ready));
      assert.equal(pool.active, 6);
      for (const client of clients) {
        assert.equal(client.streams.length, 1);
        assert.equal(client.streams[0].url, '/events');
        client.streams[0].sendModel(processSnapshot('Initial design'));
      }
      await flush();
      for (const client of clients) {
        assert.equal(client.elements.get('system-name').textContent, 'Initial design');
        if (client.location.hash === '#map') assert.ok(descendants(client.elements.get('content')).some(node => node.className === 'diagram'));
        else assert.match(client.elements.get('content').children.map(node => node.innerHTML).join('\n'), /Initial design/);
        client.navigate('#flows');
      }
      await flush();
      for (const client of clients) {
        client.control('Inspect Receive work').click();
        client.control('Open inspect inside step 7').click();
        client.streams[0].sendModel(processSnapshot('Obsolete edit'));
        client.streams[0].sendModel(processSnapshot('Latest edit'));
      }
      await flush();
      for (const client of clients) {
        assert.equal(client.location.hash, '#flow/delivery/7/inspect');
        assert.match(client.elements.get('content').textContent, /Inspect: Latest edit/);
        assert.doesNotMatch(client.elements.get('content').textContent, /Obsolete edit/);
        client.control('Copy #inspect.4');
        client.navigate('#flow/delivery');
      }
      await flush();
      for (const client of clients) {
        const detail = descendants(client.elements.get('content')).find(node => node.className === 'flow-detail');
        assert.match(detail.textContent, /Receive: Latest edit/);
        assert.doesNotMatch(detail.textContent, /Inspect the work/);
        client.streams[0].emit('error');
        assert.equal(client.elements.get('connection').lastElementChild.textContent, 'Reconnecting…');
      }
      assert.equal(pool.active, 0);
      for (const client of clients) {
        client.retry();
        client.streams[1].sendModel(processSnapshot('Reconnected edit'));
      }
      await flush();
      assert.equal(pool.active, 6);
      for (const client of clients) {
        const detail = descendants(client.elements.get('content')).find(node => node.className === 'flow-detail');
        assert.match(detail.textContent, /Receive: Reconnected edit/);
        assert.equal(client.elements.get('connection').lastElementChild.textContent, 'Live');
        client.navigate('#module/worker');
        client.streams[1].sendModel(processSnapshot('Final module edit'));
      }
      await flush();
      for (const client of clients) {
        assert.match(client.elements.get('content').children.map(node => node.innerHTML).join('\n'), /Final module edit/);
        assert.deepEqual(client.requests, []);
      }
      assert.equal(imports.length, 12);
      assert.ok(imports.every(item => item.streams === 0));
    });
  }
});

test('either failed flow asset displays a reload error without opening SSE', async t => {
  for (const failed of ['/flow.js', '/viewer/flows.js']) {
    await t.test(failed, async t => {
      const gates = new Map(['/flow.js', '/viewer/flows.js'].map(path => [path, deferred()]));
      const client = flowClient({ load: path => gates.get(path).promise });
      t.after(client.unload);
      await flush();
      assert.equal(client.streams.length, 0);
      gates.get(failed).reject(new Error(`Unavailable <asset>: ${failed}`));
      await client.ready;
      gates.get(failed === '/flow.js' ? '/viewer/flows.js' : '/flow.js').resolve();
      await flush();
      const content = client.elements.get('content');
      assert.equal(content.textContent, `Could not load the viewer: Unavailable <asset>: ${failed}. Reload to try again.`);
      assert.equal(content.innerHTML, '');
      assert.equal(client.elements.get('connection').lastElementChild.textContent, 'Reload required');
      assert.ok(client.elements.get('connection').className.split(' ').includes('offline'));
      client.navigate('#flows');
      await flush();
      assert.equal(client.streams.length, 0);
      assert.match(content.textContent, /Reload to try again/);
      assert.deepEqual(client.requests, []);
    });
  }
});

test('unloading during bootstrap prevents late streams and error messages', async t => {
  for (const fail of [false, true]) {
    await t.test(fail ? 'assets fail after unload' : 'assets load after unload', async () => {
      const pending = deferred();
      const client = flowClient({ load: () => pending.promise });
      await flush();
      client.unload();
      if (fail) pending.reject(new Error('Late asset error'));
      else pending.resolve();
      await client.ready;
      assert.equal(client.streams.length, 0);
      assert.equal(client.elements.get('content').textContent, 'Loading the design…');
      assert.equal(client.elements.get('connection').lastElementChild.textContent, 'Connecting…');
    });
  }
});

test('six live windows render initial, updated, and reconnected stream models without model requests', async () => {
  const clients = Array.from({ length: 6 }, () => {
    const elements = new Map(['content', 'system-name', 'counts', 'primary-nav', 'module-nav', 'connection', '.sidebar'].map(id => [id, element()]));
    const window = { scrollX: 0, scrollY: 0, scrollTo(x, y) { this.scrollX = x; this.scrollY = y; } };
    const location = { hash: '#module/worker' };
    const network = transport();
    let retry;
    runPage({
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
  await runPage({
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
        latest.nodeIds = nodeIds(latest);
        latest.map = diagram(latest);
        return latest;
      };
      const renders = [], listeners = {};
      const network = transport();
      const mermaid = { initialize() {}, render: (id, source) => new Promise(resolve => {
        renders.push({ source, finish: () => resolve({ svg: '<svg></svg>' }) });
      }) };
      window.mermaid = mermaid;
      const location = { hash: '#map' };
      let current = flowModel('Initial design');
      await runPage({
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
      assert.equal(renders[2].source, current.map);
      renders[2].finish();
      await flush();
      assert.equal(elements.get('system-name').textContent, 'Latest edit');
      assert.equal(location.hash, changeRoute ? '#overview' : '#map');
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
