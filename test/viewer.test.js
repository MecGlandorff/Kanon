import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, get } from 'node:http';
import childProcess, { spawn } from 'node:child_process';
import { once } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { defaultPort, browserCandidates, openWindow, startViewer } from '../runtime/src/viewer/server.js';

const cli = fileURLToPath(new URL('../runtime/cli.js', import.meta.url));
const fixture = fileURLToPath(new URL('fixtures/clean/', import.meta.url));

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(accept => server.close(accept));
  return port;
}

async function launch(t, root, port, view = 'overview') {
  const child = spawn(process.execPath, [cli, 'view', view, '--port', String(port), '--no-open'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  const ready = new Promise((accept, reject) => {
    child.stdout.on('data', chunk => { stdout += chunk; const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+\/#[^\s]+/); if (match) accept(match[0]); });
    child.on('error', reject);
    child.once('exit', () => { if (!stdout) reject(new Error(stderr || 'viewer exited before its URL')); });
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  };
  t.after(stop);
  const timer = setTimeout(() => child.kill('SIGTERM'), 10000);
  try {
    const url = await ready;
    return { child, url, stop, output: () => ({ stdout, stderr }) };
  } finally { clearTimeout(timer); }
}

function copyFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'kanon-view-'));
  cpSync(fixture, root, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return realpathSync(root);
}

function request(base, path, headers = {}) {
  return new Promise((accept, reject) => {
    const url = new URL(base);
    const req = get({ hostname: url.hostname, port: url.port, path, headers, agent: false }, response => {
      let body = '';
      response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
      response.on('end', () => accept({ status: response.statusCode, body, headers: response.headers }));
      response.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function sse(base) {
  let body = '';
  const onEvent = new Map();
  let ended;
  const events = new Map([['message', []], ['model', []]]);
  const next = (type = 'message') => events.get(type).length ? Promise.resolve(events.get(type).shift()) : new Promise(accept => { onEvent.set(type, accept); });
  let req;
  await new Promise((accept, reject) => {
    req = get(new URL('/events', base), response => {
      assert.equal(response.headers['content-type'], 'text/event-stream');
      ended = new Promise(accept => response.once('end', accept));
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        let end;
        while ((end = body.indexOf('\n\n')) !== -1) {
          const frame = body.slice(0, end); body = body.slice(end + 2);
          let type = 'message';
          const data = [];
          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) type = line.slice(7);
            if (line.startsWith('data: ')) data.push(line.slice(6));
          }
          if (!data.length || !events.has(type)) continue;
          const value = data.join('\n');
          if (onEvent.has(type)) { const callback = onEvent.get(type); onEvent.delete(type); callback(value); } else events.get(type).push(value);
        }
      });
      accept();
    });
    req.on('error', reject);
  });
  return { next, ended, close: () => req.destroy() };
}

test('viewer serves fixed routes and vendored bytes, broadcasts live changes, reuses its server, and stops', { timeout: 15000 }, async t => {
  const root = copyFixture(t);
  const instance = await launch(t, root, await freePort());
  const base = new URL(instance.url).origin;
  const modelResponse = await request(base, '/model');
  assert.equal(modelResponse.status, 200);
  const model = JSON.parse(modelResponse.body);
  assert.equal(model.designDir, join(root, 'design'));
  assert.equal(model.name, 'Parcel workshop');
  assert.equal(model.modules.length, 4);
  assert.equal(model.findings.length, 0);
  assert.deepEqual(model.mainFlows, ['process']);
  assert.ok(model.routes.process.includes('3 repeat until'));
  const page = await request(base, '/');
  assert.equal(page.status, 200);
  assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(page.headers['content-security-policy'], /connect-src http:\/\/127\.0\.0\.1:/);
  const vendor = await request(base, '/vendor/mermaid.min.js');
  assert.equal(vendor.status, 200);
  assert.equal(vendor.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal(vendor.body, readFileSync(new URL('../runtime/vendor/mermaid.min.js', import.meta.url), 'utf8'));
  for (const [path, file, type] of [
    ['/flow.js', '../runtime/src/flow.js', 'text/javascript; charset=utf-8'],
    ['/viewer/flows.js', '../runtime/src/viewer/flows.js', 'text/javascript; charset=utf-8'],
    ['/viewer/flows.css', '../runtime/src/viewer/flows.css', 'text/css; charset=utf-8'],
  ]) {
    const asset = await request(base, path);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers['content-type'], type);
    assert.equal(asset.body, readFileSync(new URL(file, import.meta.url), 'utf8'));
  }
  for (const path of ['/../package.json', '/package.json', '/design/system.md', '/%2e%2e/package.json', '/vendor/../cli.js', '/unknown']) assert.equal((await request(base, path)).status, 404, path);
  assert.equal((await request(base, '/model', { Host: 'other.example' })).status, 403);
  const first = await sse(base);
  const second = await sse(base);
  t.after(() => { first.close(); second.close(); });
  const initialModels = await Promise.all([first.next('model'), second.next('model')]);
  for (const initial of initialModels) assert.deepEqual(JSON.parse(initial), model);
  const received = Promise.all([first.next(), second.next(), first.next('model'), second.next('model')]);
  const file = join(root, 'design', 'modules', 'worker.md');
  const start = Date.now();
  writeFileSync(file, readFileSync(file, 'utf8').replace('Process a parcel and acknowledge it once.', 'Process a parcel after validation.'));
  let timer;
  const changes = await Promise.race([received, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no SSE event within two seconds; viewer exit=${instance.child.exitCode}, signal=${instance.child.signalCode}, stderr=${instance.output().stderr}`)), 2000);
  })]).finally(() => clearTimeout(timer));
  assert.ok(Date.now() - start < 2000);
  const paths = changes.slice(0, 2);
  assert.ok(paths.every(path => path.includes('worker.md')), paths.join(', '));
  const updated = JSON.parse((await request(base, '/model')).body);
  assert.ok(updated.modules.find(module => module.name === 'worker').raw.includes('after validation'));
  for (const delivered of changes.slice(2)) assert.deepEqual(JSON.parse(delivered), updated);
  const reconnected = await sse(base);
  t.after(() => reconnected.close());
  assert.deepEqual(JSON.parse(await reconnected.next('model')), updated);
  reconnected.close();
  const reuse = await launch(t, root, Number(new URL(base).port), 'questions');
  if (reuse.child.exitCode === null) await once(reuse.child, 'exit');
  assert.equal(reuse.child.exitCode, 0);
  assert.equal(reuse.url, `${base}/#questions`);
  assert.equal(reuse.output().stdout, `${base}/#questions\n`);
  first.close(); second.close();
  await instance.stop();
  assert.equal(instance.child.exitCode, process.platform === 'win32' ? null : 0);
  assert.equal(instance.child.signalCode, process.platform === 'win32' ? 'SIGTERM' : null);
  assert.equal(instance.output().stderr, '');
  await assert.rejects(request(base, '/model'), /ECONNREFUSED|ECONNRESET/);
});

test('flow URLs and live snapshots carry authored blocks and nested references', { timeout: 10000 }, async t => {
  const root = copyFixture(t);
  const parent = join(root, 'design/flows/process.md');
  writeFileSync(parent, '## Steps\n### Process a parcel\nPreserve its identity.\n1. operator -> worker: inspect (flow: inspect 100%)\n');
  writeFileSync(join(root, 'design/flows/inspect 100%.md'), '## Steps\n1. worker -> queue: read the next parcel\n');
  const instance = await startViewer(join(root, 'design'), { port: await freePort(), view:'flow/process/1/inspect%20100%25', open:false, log() {} });
  t.after(() => instance.close());
  assert.equal(new URL(instance.url).hash, '#flow/process/1/inspect%20100%25');
  const stream = await sse(instance.url); t.after(() => stream.close());
  const initial = JSON.parse(await stream.next('model'));
  assert.deepEqual(initial.mainFlows, ['process']);
  const flow = initial.flows.find(item => item.name === 'process');
  assert.equal(flow.steps[0].flow, 'inspect 100%');
  assert.equal(flow.steps[0].line, 4);
  assert.deepEqual(flow.blocks, [{ title:'Process a parcel', summary:'Preserve its identity.', steps:[1], line:2 }]);
  const next = stream.next('model');
  writeFileSync(parent, '## Steps\n### Updated block\n1. operator -> worker: inspect the updated parcel (flow: inspect 100%)\n');
  const updated = JSON.parse(await next);
  assert.deepEqual(updated.mainFlows, ['process']);
  assert.equal(updated.flows.find(item => item.name === 'process').blocks[0].title, 'Updated block');
  await instance.close();
});

test('viewer.close ends live streams, removes signal handlers, and releases its port', { timeout: 10000 }, async t => {
  const root = copyFixture(t);
  const signals = ['SIGINT', 'SIGTERM'];
  const listeners = signals.map(signal => process.listeners(signal));
  const instance = await startViewer(join(root, 'design'), { port: await freePort(), open: false, log() {} });
  t.after(() => instance.close());
  const stream = await sse(instance.url);
  t.after(() => stream.close());
  assert.equal(JSON.parse((await request(instance.url, '/model')).body).name, 'Parcel workshop');
  for (const [index, signal] of signals.entries()) assert.equal(process.listenerCount(signal), listeners[index].length + 1);
  const closing = instance.close();
  assert.equal(instance.close(), closing);
  await closing;
  await stream.ended;
  assert.equal(instance.server.listening, false);
  for (const [index, signal] of signals.entries()) assert.deepEqual(process.listeners(signal), listeners[index]);
  await assert.rejects(request(instance.url, '/model'), /ECONNREFUSED|ECONNRESET/);
  const replacement = await startViewer(join(root, 'design'), { port: instance.port, open: false, log() {} });
  t.after(() => replacement.close());
  assert.equal(replacement.reused, false);
  assert.equal(replacement.port, instance.port);
  await replacement.close();
});

test('a busy port owned by a different repository is skipped', { timeout: 10000 }, async t => {
  const occupied = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ designDir: '/a/different/design' })); });
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  t.after(() => new Promise(accept => occupied.close(accept)));
  const first = occupied.address().port;
  const instance = await launch(t, copyFixture(t), first);
  const actual = Number(new URL(instance.url).port);
  assert.ok(actual > first && actual < first + 20);
  assert.equal(JSON.parse((await request(instance.url, '/model')).body).name, 'Parcel workshop');
  await instance.stop();
});

test('port derivation is deterministic and platform browser paths use the specified locations', () => {
  const path = join(tmpdir(), 'Kanon café', 'design');
  assert.equal(defaultPort(path), defaultPort(path));
  assert.ok(defaultPort(path) >= 4700 && defaultPort(path) < 4900);
  const mac = browserCandidates({ platform: 'darwin', userHome: '/people/test', env: {} });
  assert.equal(mac[0], '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.ok(mac.includes('/people/test/Applications/Arc.app/Contents/MacOS/Arc'));
  const windows = browserCandidates({ platform: 'win32', env: { ProgramFiles: 'D:\\Programs', LOCALAPPDATA: 'C:\\Users\\A\\AppData\\Local' } });
  assert.ok(windows.includes('D:\\Programs\\Google\\Chrome\\Application\\chrome.exe'));
  assert.ok(windows.includes('C:\\Users\\A\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe'));
  const linux = browserCandidates({ platform: 'linux', env: { PATH: '/opt/chromium/bin:/usr/bin' } });
  assert.equal(linux.length, 10);
  assert.ok(linux.includes('/opt/chromium/bin/chromium'));
  assert.ok(linux.includes('/usr/bin/chromium'));
});

for (const native of [false, true]) {
  test(native ? 'Windows cmd and start pass complete viewer URLs literally to a child program' : 'Windows fallback transfers the viewer URL without changing the parent environment', {
    skip: native && process.platform !== 'win32', timeout: 15000,
  }, async t => {
    const root = copyFixture(t);
    const name = "café 20% !KANON_CMD_BANG! (draft) %KANON_CMD_PERCENT% & x^y; 'quote'#next";
    writeFileSync(join(root, 'design/modules', `${name}.md`), '---\nkind: library\nstatus: agreed\n---\n## Responsibility\nExercise literal URL forwarding.\n');
    const instance = await startViewer(join(root, 'design'), { port: await freePort(), view: `module/${name}`, open: false, log() {} });
    t.after(() => instance.close());
    await instance.close();
    const urls = [`${new URL(instance.url).origin}/#overview`, instance.url];
    assert.equal(new URL(instance.url).hash, `#module/${encodeURIComponent(name)}`);
    const recorder = join(root, 'record arguments.cjs');
    writeFileSync(recorder, 'process.stdout.write(JSON.stringify({ args: process.argv.slice(2), url: process.env.KANON_VIEW_URL ?? null }));\n');
    const missing = join(root, 'no-browsers');
    const env = { ...process.env, ProgramFiles: missing, 'ProgramFiles(x86)': missing, LOCALAPPDATA: missing,
      KANON_VIEW_URL: 'parent value', KANON_CMD_BANG: 'expanded bang', '25KANON_CMD_PERCENT': 'expanded percent',
      '20': 'expanded space', C3: 'expanded UTF8', A9: 'expanded UTF8 continuation' };
    const spawnProcess = spawn;
    let completed;
    t.mock.method(childProcess, 'spawn', (executable, args, options) => {
      let command = process.execPath;
      let forwarded = [recorder];
      if (native) {
        command = executable;
        forwarded = args.slice(0, -1);
        const start = forwarded.indexOf('start');
        assert.ok(start >= 0);
        forwarded.splice(start + 1, 0, '/b', '/wait');
        forwarded.push('"%KANON_TEST_NODE%"', '"%KANON_TEST_RECORDER%"', args.at(-1));
      }
      const child = spawnProcess(command, forwarded, { ...options,
        ...(native ? {} : { windowsVerbatimArguments: false }),
        env: { ...(options.env ?? env), KANON_TEST_NODE: process.execPath, KANON_TEST_RECORDER: recorder },
        detached: false, stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
      let stdout = '', stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      completed = once(child, 'close').then(([code]) => ({ code, stdout, stderr }));
      return child;
    });
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    const notices = [];
    for (const url of urls) {
      const opened = await openWindow(url, { platform: 'win32', env, notice: message => notices.push(message) });
      assert.equal(opened.appMode, false);
      const result = await completed;
      assert.equal(result.code, 0, result.stderr);
      const received = JSON.parse(result.stdout);
      assert.equal(received.url, url);
      if (native) assert.deepEqual(received.args, [url]);
      assert.equal(env.KANON_VIEW_URL, 'parent value');
    }
    assert.equal(notices.length, urls.length);
  });
}

test('startup includes edits during a streaming port probe and cannot be held open indefinitely', { timeout: 5000 }, async t => {
  const root = copyFixture(t);
  const file = join(root, 'design', 'modules', 'worker.md');
  const occupied = createServer((_req, res) => {
    writeFileSync(file, readFileSync(file, 'utf8').replace('Process a parcel and acknowledge it once.', 'Changed during the startup probe.'));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(': waiting\n\n');
    const heartbeat = setInterval(() => res.write(': waiting\n\n'), 50);
    res.on('close', () => clearInterval(heartbeat));
  });
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  t.after(() => new Promise(accept => { occupied.close(accept); occupied.closeAllConnections(); }));
  const first = occupied.address().port;
  const start = Date.now();
  const instance = await launch(t, root, first);
  assert.ok(Number(new URL(instance.url).port) > first);
  assert.ok(Date.now() - start < 2000);
  const model = JSON.parse((await request(instance.url, '/model')).body);
  assert.equal(model.modules.find(module => module.name === 'worker').sections.find(section => section.title === 'Responsibility').text, 'Changed during the startup probe.');
  await instance.stop();
});
