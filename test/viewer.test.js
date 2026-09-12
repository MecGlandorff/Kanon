import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, get } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { defaultPort, browserCandidates } from '../runtime/src/viewer/server.js';

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
  let onEvent;
  const events = [];
  const next = () => events.length ? Promise.resolve(events.shift()) : new Promise(accept => { onEvent = accept; });
  let req;
  await new Promise((accept, reject) => {
    req = get(new URL('/events', base), response => {
      assert.equal(response.headers['content-type'], 'text/event-stream');
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        let end;
        while ((end = body.indexOf('\n\n')) !== -1) {
          const frame = body.slice(0, end); body = body.slice(end + 2);
          if (frame.startsWith('data: ')) {
            const value = frame.slice(6);
            if (onEvent) { const callback = onEvent; onEvent = null; callback(value); } else events.push(value);
          }
        }
      });
      accept();
    });
    req.on('error', reject);
  });
  return { next, close: () => req.destroy() };
}

test('viewer serves only the fixed routes, broadcasts live changes, reuses its server, and stops cleanly', { timeout: 15000 }, async t => {
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
  assert.ok(model.routes.process.includes('3 repeat until'));
  const page = await request(base, '/');
  assert.match(page.headers['content-security-policy'], /connect-src http:\/\/127\.0\.0\.1:/);
  assert.match(page.body, /src="\/vendor\/mermaid.min.js"/);
  assert.doesNotMatch(page.body, /https:\/\//);
  const vendor = await request(base, '/vendor/mermaid.min.js');
  assert.equal(vendor.body, readFileSync(new URL('../runtime/vendor/mermaid.min.js', import.meta.url), 'utf8'));
  for (const path of ['/../package.json', '/package.json', '/design/system.md', '/%2e%2e/package.json', '/vendor/../cli.js', '/unknown']) assert.equal((await request(base, path)).status, 404, path);
  assert.equal((await request(base, '/model', { Host: 'other.example' })).status, 403);
  const first = await sse(base);
  const second = await sse(base);
  t.after(() => { first.close(); second.close(); });
  const received = Promise.all([first.next(), second.next()]);
  const file = join(root, 'design', 'modules', 'worker.md');
  const start = Date.now();
  writeFileSync(file, readFileSync(file, 'utf8').replace('Process a parcel and acknowledge it once.', 'Process a parcel after validation.'));
  let timer;
  const paths = await Promise.race([received, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('no SSE event within two seconds')), 2000); })]).finally(() => clearTimeout(timer));
  assert.ok(Date.now() - start < 2000);
  assert.ok(paths.every(path => path.includes('worker.md')), paths.join(', '));
  const updated = JSON.parse((await request(base, '/model')).body);
  assert.ok(updated.modules.find(module => module.name === 'worker').raw.includes('after validation'));
  const reuse = await launch(t, root, Number(new URL(base).port), 'questions');
  if (reuse.child.exitCode === null) await once(reuse.child, 'exit');
  assert.equal(reuse.child.exitCode, 0);
  assert.equal(reuse.url, `${base}/#questions`);
  assert.equal(reuse.output().stdout, `${base}/#questions\n`);
  first.close(); second.close();
  await instance.stop();
  assert.equal(instance.child.exitCode, 0);
  assert.equal(instance.output().stderr, '');
  await assert.rejects(request(base, '/model'), /ECONNREFUSED|ECONNRESET/);
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
  assert.ok(browserCandidates({ platform: 'linux', env: { PATH: '/usr/bin' } }).includes('/usr/bin/chromium'));
});

test('a streaming response on an occupied port cannot hold startup open indefinitely', { timeout: 5000 }, async t => {
  const occupied = createServer((_req, res) => {
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
  const instance = await launch(t, copyFixture(t), first);
  assert.ok(Number(new URL(instance.url).port) > first);
  assert.ok(Date.now() - start < 2000);
  await instance.stop();
});
