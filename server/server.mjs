/** Local development server: serves web/ and runs the *same* edge application (edge/app.mjs) that is
    deployed on Arvan Edge, with a small disk-backed store in place of Arvan Object Storage. */
import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../edge/app.mjs';
import { memoryStore } from '../edge/s3.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4173);
const DATA_FILE = path.join(ROOT, 'server/data/store.json');

/** memoryStore persisted to disk after every write (dev only). */
async function diskStore() {
  let initial = {};
  try { initial = JSON.parse(await readFile(DATA_FILE, 'utf8')); } catch {}
  const mem = memoryStore();
  for (const [k, v] of Object.entries(initial)) mem.data.set(k, v);
  let chain = Promise.resolve();
  const save = () => (chain = chain.then(async () => { await mkdir(path.dirname(DATA_FILE), { recursive: true }); const tmp = DATA_FILE + '.tmp'; await writeFile(tmp, JSON.stringify(Object.fromEntries(mem.data))); await rename(tmp, DATA_FILE); }));
  return { ...mem, kind: 'disk', async put(k, b, o) { const ok = await mem.put(k, b, o); if (ok) await save(); return ok; } };
}
const store = process.env.NODE_ENV === 'test' ? memoryStore() : await diskStore();
const app = createApp({ env: { ...process.env }, store, log: (...a) => console.log(...a) });

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
async function staticFile(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname === '/' ? '/index.html' : url.pathname === '/edge' ? '/edge.html' : decodeURIComponent(url.pathname);
  const file = path.resolve(ROOT, 'web', '.' + p);
  if (!file.startsWith(path.resolve(ROOT, 'web') + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    const headers = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
    // Byte ranges let Safari stream the music files.
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    if (m && (m[1] || m[2])) {
      const a = m[1] ? Number(m[1]) : data.length - Number(m[2]); const b = Math.min(m[1] && m[2] ? Number(m[2]) : data.length - 1, data.length - 1);
      if (a > b || a >= data.length) { res.writeHead(416, { 'Content-Range': `bytes */${data.length}` }); res.end(); return; }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${a}-${b}/${data.length}`, 'Content-Length': b - a + 1 }); res.end(data.subarray(a, b + 1)); return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': data.length }); res.end(data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); }
}
export function handler(req, res) {
  (async () => {
    if (!req.url.startsWith('/api/')) return staticFile(req, res);
    let body;
    if (req.method === 'POST') { const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > 100000) break; chunks.push(c); } body = Buffer.concat(chunks); }
    const request = new Request(new URL(req.url, 'http://localhost'), { method: req.method, headers: { 'x-real-ip': req.socket.remoteAddress || 'local', 'content-type': 'application/json' }, body });
    const response = await app.handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  })().catch((err) => { console.error('request failure', err.message); if (!res.headersSent) { res.writeHead(500); } res.end(); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  http.createServer(handler).listen(PORT, '0.0.0.0', () => console.log(`ESCAPE60 http://localhost:${PORT}  (storage: ${store.kind}, AI: ${process.env.AI_API_KEY ? 'on' : 'fallback'})`));
}
