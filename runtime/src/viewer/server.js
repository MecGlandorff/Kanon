import { createServer, get } from 'node:http';
import { accessSync, constants, readFileSync, watch } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { posix, resolve, win32 } from 'node:path';
import { parseDesign } from '../parse.js';
import { check } from '../check.js';
import { diagram, nodeIds } from '../diagram.js';

export function defaultPort(designDir) {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(resolve(designDir), 'utf8')) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return 4700 + (hash % 200);
}

export function browserCandidates({ platform = process.platform, env = process.env, userHome = homedir() } = {}) {
  if (platform === 'darwin') {
    const names = ['Google Chrome', 'Chromium', 'Microsoft Edge', 'Brave Browser', 'Arc'];
    return ['/Applications', posix.join(userHome, 'Applications')].flatMap(folder => names.map(name => posix.join(folder, `${name}.app`, 'Contents', 'MacOS', name)));
  }
  if (platform === 'win32') {
    return [env.ProgramFiles || 'C:\\Program Files', env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', env.LOCALAPPDATA].filter(Boolean).flatMap(folder => [
      win32.join(folder, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      win32.join(folder, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      win32.join(folder, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    ]);
  }
  return (env.PATH ?? '').split(posix.delimiter).filter(Boolean).flatMap(folder => ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'].map(name => posix.join(folder, name)));
}

export async function openWindow(url, { platform = process.platform, env = process.env, notice = console.error } = {}) {
  const browser = browserCandidates({ platform, env }).find(file => {
    try { accessSync(file, constants.X_OK); return true; } catch { return false; }
  });
  let executable = browser;
  let args = [`--app=${url}`];
  if (!browser) {
    notice('Kanon: app mode is unavailable; opening the default browser.');
    if (platform === 'darwin') { executable = 'open'; args = [url]; }
    else if (platform === 'win32') { executable = env.ComSpec || 'cmd.exe'; args = ['/d', '/v:off', '/s', '/c', 'start', '""', `"${url}"`]; }
    else { executable = 'xdg-open'; args = [url]; }
  }
  const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: true });
  await new Promise((accept, reject) => { child.once('error', reject); child.once('spawn', accept); });
  child.unref();
  return { executable, args, appMode: Boolean(browser) };
}

function probe(port, designDir) {
  return new Promise(accept => {
    let settled = false;
    let deadline;
    const done = value => { if (!settled) { settled = true; clearTimeout(deadline); accept(value); } };
    const request = get({ host: '127.0.0.1', port, path: '/model', agent: false, timeout: 350 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if (body.length > 4 * 1024 * 1024) { request.destroy(); done(false); } });
      response.on('end', () => {
        try { done(response.statusCode === 200 && JSON.parse(body).designDir === designDir); }
        catch { done(false); }
      });
      response.on('error', () => done(false));
    });
    deadline = setTimeout(() => { request.destroy(); done(false); }, 350);
    request.on('timeout', () => { request.destroy(); done(false); });
    request.on('error', () => done(false));
  });
}

function snapshot(designDir) {
  const model = parseDesign(designDir);
  const focused = model.modules.filter(module => ['agent', 'human', 'external', 'trigger'].includes(module.kind));
  const names = new Set(focused.map(module => module.name));
  const focusedModel = { ...model, modules: focused.map(module => ({ ...module, uses: module.uses.filter(ref => names.has(ref.name)) })) };
  return { ...model, findings: check(model), nodeIds: nodeIds(model), map: diagram(model), focusedMap: diagram(focusedModel, null, nodeIds(model)), focusedNames: [...names],
    routes: Object.fromEntries(model.flows.map(flow => [flow.name, diagram(model, flow)])) };
}

function viewHash(view, model) {
  if (['overview', 'flows', 'decisions', 'questions', 'slices'].includes(view)) return view;
  if (view.startsWith('module/') && model.modules.some(module => module.name === view.slice(7))) return `module/${encodeURIComponent(view.slice(7))}`;
  throw new Error(`unknown view "${view}"`);
}

export async function startViewer(directory, { port, view = 'overview', open = true, log = console.log, notice = console.error } = {}) {
  const designDir = resolve(directory);
  let model = snapshot(designDir);
  const hash = viewHash(view, model);
  const firstPort = port ?? defaultPort(designDir);
  const page = readFileSync(new URL('page.html', import.meta.url));
  const inline = page.toString().match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const scriptHash = createHash('sha256').update((inline ?? '').replace(/\r\n?/g, '\n')).digest('base64');
  const vendor = readFileSync(new URL('../../vendor/mermaid.min.js', import.meta.url));
  const clients = new Set();
  let server;
  let chosenPort;
  const contentTypes = { html: 'text/html; charset=utf-8', json: 'application/json; charset=utf-8', js: 'text/javascript; charset=utf-8' };
  const requestHandler = (request, response) => {
    const origin = `http://127.0.0.1:${chosenPort}`;
    if (request.headers.host !== `127.0.0.1:${chosenPort}` && request.headers.host !== `localhost:${chosenPort}`) {
      response.writeHead(403); response.end('Forbidden'); return;
    }
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self' 'sha256-${scriptHash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${origin} http://localhost:${chosenPort}; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
    const route = request.url?.split('?')[0];
    if (request.method !== 'GET') { response.writeHead(404); response.end('Not found'); return; }
    if (route === '/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      response.write(': connected\n\n');
      clients.add(response);
      response.on('close', () => clients.delete(response));
    } else if (route === '/') {
      response.writeHead(200, { 'Content-Type': contentTypes.html }); response.end(page);
    } else if (route === '/model') {
      response.writeHead(200, { 'Content-Type': contentTypes.json }); response.end(JSON.stringify(model));
    } else if (route === '/vendor/mermaid.min.js') {
      response.writeHead(200, { 'Content-Type': contentTypes.js }); response.end(vendor);
    } else { response.writeHead(404); response.end('Not found'); }
  };
  for (let offset = 0; offset < 20 && firstPort + offset <= 65535; offset++) {
    const candidate = firstPort + offset;
    const url = `http://127.0.0.1:${candidate}/#${hash}`;
    if (await probe(candidate, designDir)) {
      log(url);
      if (open) await openWindow(url, { notice }).catch(error => notice(`Kanon: could not open a window (${error.message}); use the URL above.`));
      return { reused: true, port: candidate, url, close: async () => {} };
    }
    server = createServer(requestHandler);
    try {
      await new Promise((accept, reject) => {
        server.once('error', reject);
        server.listen(candidate, '127.0.0.1', () => { server.removeListener('error', reject); accept(); });
      });
      chosenPort = candidate;
      break;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      server = null;
    }
  }
  if (!server?.listening) throw new Error(`no available viewer port in ${firstPort}–${Math.min(firstPort + 19, 65535)}`);
  let debounce;
  let watcher;
  const heartbeat = setInterval(() => { for (const client of clients) client.write(': alive\n\n'); }, 15000);
  heartbeat.unref();
  let closing;
  const close = () => {
    if (closing) return closing;
    clearTimeout(debounce);
    clearInterval(heartbeat);
    watcher?.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    for (const client of clients) client.end();
    closing = new Promise(accept => { server.close(accept); server.closeAllConnections(); });
    return closing;
  };
  const stop = () => { void close(); };
  try {
    watcher = watch(designDir, { recursive: true }, (_event, filename) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        try { model = snapshot(designDir); }
        catch (error) { model = { ...model, modules: [], flows: [], slices: [], decisions: [], questions: [], map: '', routes: {}, findings: [{ level: 'error', file: 'design', line: 1, message: error.message }] }; }
        const changed = String(filename ?? 'design/').replaceAll('\\', '/').replace(/[\r\n]/g, ' ');
        for (const client of clients) client.write(`data: ${changed}\n\n`);
      }, 150);
    });
    watcher.on('error', error => { notice(`Kanon: file watcher stopped (${error.message}). Restart the viewer to reconnect.`); void close(); });
    model = snapshot(designDir);
  } catch (error) { await close(); throw error; }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const url = `http://127.0.0.1:${chosenPort}/#${hash}`;
  log(url);
  if (open) await openWindow(url, { notice }).catch(error => notice(`Kanon: could not open a window (${error.message}); use the URL above.`));
  return { server, reused: false, port: chosenPort, url, close };
}
