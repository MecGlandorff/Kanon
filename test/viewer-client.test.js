import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

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
