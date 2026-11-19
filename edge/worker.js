/* Edge entry point (Service Worker `fetch` interface). Built by `npm run build` into
   dist/edge/worker.js and deployed as one edge compute.
   Environment variables (secrets encrypted in the edge settings, never committed):
     S3_ACCESS_KEY, S3_SECRET_KEY  S3-compatible object storage key pair (leaderboard + runs)
   Optional: S3_BUCKET, S3_ENDPOINT, S3_REGION, STATIC_ORIGIN, RUN_SECRET. */
import { createApp } from './app.mjs';
import { s3Store, memoryStore } from './s3.mjs';

// Variables are JSON; tolerate stray whitespace around pasted keys.
const E = Object.fromEntries(Object.entries(globalThis.env || {}).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
const S3_BUCKET = E.S3_BUCKET || 'escape60-data';
const S3_ENDPOINT = E.S3_ENDPOINT || 'https://s3.ir-central1.arvanstorage.ir';
const S3_REGION = E.S3_REGION || 'ir-central1';
const STATIC_ORIGIN = String(E.STATIC_ORIGIN || 'https://escape60-game.s3.ir-central1.arvanstorage.ir').replace(/\/$/, '');
const store = E.S3_ACCESS_KEY && E.S3_SECRET_KEY
  ? s3Store({ endpoint: S3_ENDPOINT, region: S3_REGION, bucket: S3_BUCKET, accessKey: E.S3_ACCESS_KEY, secretKey: E.S3_SECRET_KEY })
  : memoryStore();
const app = createApp({ env: E, store, log: (...a) => console.log(...a) });

const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', json: 'application/json', woff2: 'font/woff2', png: 'image/png', jpg: 'image/jpeg', mp3: 'audio/mpeg', wav: 'audio/wav', md: 'text/plain; charset=utf-8', txt: 'text/plain; charset=utf-8', webmanifest: 'application/manifest+json' };
const ROUTES = { '/': 'index.html' };
/** Static game files live flat in a public bucket; the edge is the only public origin. */
async function staticFile(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const url = new URL(req.url);
  const name = ROUTES[url.pathname] || url.pathname.split('/').pop();
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(name) || name.startsWith('.')) return new Response('Not found', { status: 404 });
  const headers = {};
  const range = req.headers.get('range'); if (range) headers.Range = range;
  const upstream = await fetch(`${STATIC_ORIGIN}/${name}`, { method: req.method, headers });
  if (upstream.status === 404 || upstream.status === 403) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  const ext = name.split('.').pop().toLowerCase();
  const out = new Headers();
  for (const h of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
  out.set('Content-Type', TYPES[ext] || 'application/octet-stream');
  // Hashed bundles are immutable; HTML revalidates quickly so new builds reach players at once.
  out.set('Cache-Control', ext === 'html' ? 'public, max-age=30' : /-[A-Z0-9]{8}\.(js|css)$/.test(name) ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
  out.set('X-Content-Type-Options', 'nosniff');
  out.set('Referrer-Policy', 'no-referrer');
  out.set('X-Escape60-Edge', '1');
  if (ext === 'html') out.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    try { return (await app.handle(event.request)) || (await staticFile(event.request)); }
    catch (e) { console.log('edge error', e && e.message); return new Response(JSON.stringify({ error: 'Edge unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); }
  })());
});
