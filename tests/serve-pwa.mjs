import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// Local test server; mirror the deployed _headers contract without adding a runtime server.
const root = resolve('dist/site');
const rules = [];
for (const line of (await readFile(resolve(root, '_headers'), 'utf8')).split('\n')) {
  if (!line.trim()) continue;
  if (!/^\s/.test(line)) rules.push({ path: line, headers: [] });
  else rules.at(-1).headers.push(line.trim());
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
let workerRevision = '';
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // A deterministic update exercises the browser's real waiting-worker lifecycle.
  if (url.pathname === '/__test-update' && req.method === 'POST') {
    workerRevision = '\n// Test update: keep the active document session.\n';
    res.writeHead(204).end(); return;
  }
  try {
    const path = decodeURIComponent(url.pathname);
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    for (const rule of rules) {
      if (rule.path !== '/*' && rule.path !== path) continue;
      for (const header of rule.headers) {
        if (header.startsWith('! ')) { res.removeHeader(header.slice(2)); continue; }
        const colon = header.indexOf(':');
        const name = header.slice(0, colon), value = header.slice(colon + 1).trim();
        const previous = res.getHeader(name);
        res.setHeader(name, previous ? `${previous}, ${value}` : value);
      }
    }
    res.end(path === '/sw.js' ? Buffer.concat([body, Buffer.from(workerRevision)]) : body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(Number(process.env.PWA_TEST_PORT || 4179), '127.0.0.1');
