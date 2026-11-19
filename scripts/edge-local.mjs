/* Run the built edge worker (dist/edge/worker.js) the way the edge runs it — Service Worker `fetch`
   event, `env` global — with dist/web served as the static bucket. Lets you test the exact deploy
   artefact before pasting it into the panel:
     npm run build && npm run edge:local          → http://localhost:4174 (game, /edge, /r/<id>, API)
   Env: PORT (4174), BUCKET_PORT (4180), edge variables (RUN_SECRET, REPLAY_CHUNK, PRECOMPRESSED, AI_API_KEY, AI_BASE…). */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const web = path.join(root, 'dist/web'), worker = path.join(root, 'dist/edge/worker.js');
const PORT = Number(process.env.PORT || 4174), BUCKET_PORT = Number(process.env.BUCKET_PORT || 4180);
try { await stat(worker); } catch { console.error('dist/edge/worker.js missing — run npm run build'); process.exit(1); }

// the "bucket": flat public files with byte ranges, like object storage
http.createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://b').pathname.slice(1));
  if (!/^[A-Za-z0-9._-]+$/.test(name)) { res.writeHead(404); res.end(); return; }
  try {
    const data = await readFile(path.join(web, name));
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    if (m && (m[1] || m[2])) {
      const a = m[1] ? Number(m[1]) : data.length - Number(m[2]), b = Math.min(m[1] && m[2] ? Number(m[2]) : data.length - 1, data.length - 1);
      res.writeHead(206, { 'Content-Range': `bytes ${a}-${b}/${data.length}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes' }); res.end(req.method === 'HEAD' ? undefined : data.subarray(a, b + 1)); return;
    }
    res.writeHead(200, { 'Content-Length': data.length, 'Accept-Ranges': 'bytes', ETag: `"${data.length}"` }); res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end(); }
}).listen(BUCKET_PORT, '127.0.0.1');

// the edge runtime
globalThis.env = { STATIC_ORIGIN: `http://127.0.0.1:${BUCKET_PORT}`, ...Object.fromEntries(['RUN_SECRET', 'REPLAY_CHUNK', 'PRECOMPRESSED', 'MIN_PLAY_RATIO', 'AI_API_KEY', 'AI_BASE', 'AI_MODEL', 'AI_DAILY_CAP'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])) };
let onFetch = null;
globalThis.addEventListener = (type, fn) => { if (type === 'fetch') onFetch = fn; };
await import(pathToFileURL(worker).href);
if (!onFetch) { console.error('worker registered no fetch handler'); process.exit(1); }

http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    headers.set('ar-real-ip', req.socket.remoteAddress || 'local');
    const request = new Request(new URL(req.url, `http://${req.headers.host}`), { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    let pending; const later = [];
    onFetch({ request, respondWith: (p) => { pending = p; }, waitUntil: (p) => later.push(p) });
    const response = await pending;
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    await Promise.allSettled(later);
  } catch (e) { console.error('edge-local', e); if (!res.headersSent) res.writeHead(500); res.end(); }
}).listen(PORT, '0.0.0.0', () => console.log(`edge worker on http://localhost:${PORT}  (bucket http://127.0.0.1:${BUCKET_PORT})`));
