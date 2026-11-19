/* Edge entry point (Service Worker `fetch` interface). Built by `npm run build` into
   dist/edge/worker.js and deployed as one edge compute: the game service (edge/app.mjs), the
   /r/<id> link previews, the /edge dashboard and every static file of the game.
   Environment variables (secrets encrypted in the edge settings, never committed):
     S3_ACCESS_KEY, S3_SECRET_KEY  S3-compatible object storage key pair (leaderboard, runs, telemetry)
   Optional: S3_BUCKET, S3_ENDPOINT, S3_REGION, STATIC_ORIGIN, RUN_SECRET, REPLAY_CHUNK,
             PRECOMPRESSED (false = serve only uncompressed files). */
import { createApp } from './app.mjs';
import { s3Store, memoryStore } from './s3.mjs';
import { createStatic } from './static.mjs';

// Variables are JSON; tolerate stray whitespace around pasted keys.
const E = Object.fromEntries(Object.entries(globalThis.env || {}).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
const S3_BUCKET = E.S3_BUCKET || 'escape60-data';
const S3_ENDPOINT = E.S3_ENDPOINT || 'https://s3.ir-central1.arvanstorage.ir';
const S3_REGION = E.S3_REGION || 'ir-central1';
const STATIC_ORIGIN = String(E.STATIC_ORIGIN || 'https://escape60-game.s3.ir-central1.arvanstorage.ir').replace(/\/$/, '');
const PRECOMPRESSED = ![false, 'false', 0, '0', 'off'].includes(E.PRECOMPRESSED);
// File sizes of this build (raw / Brotli / gzip), injected by scripts/build.mjs.
const SIZES = typeof __ASSET_SIZES__ !== 'undefined' ? __ASSET_SIZES__ : null; // eslint-disable-line no-undef
const store = E.S3_ACCESS_KEY && E.S3_SECRET_KEY
  ? s3Store({ endpoint: S3_ENDPOINT, region: S3_REGION, bucket: S3_BUCKET, accessKey: E.S3_ACCESS_KEY, secretKey: E.S3_SECRET_KEY })
  : memoryStore();
let indexMemo = null;
async function loadIndex() {
  if (indexMemo && Date.now() - indexMemo.at < 30000) return indexMemo.html;
  const r = await fetch(`${STATIC_ORIGIN}/index.html`);
  if (!r.ok) throw Error(`index.html ${r.status}`);
  indexMemo = { at: Date.now(), html: await r.text() };
  return indexMemo.html;
}
const app = createApp({ env: E, store, log: (...a) => console.log(...a), loadIndex });
const staticFile = createStatic({ origin: STATIC_ORIGIN, sizes: SIZES, precompressed: PRECOMPRESSED, metrics: app.metrics });

addEventListener('fetch', (event) => {
  const ctx = { waitUntil: typeof event.waitUntil === 'function' ? (p) => event.waitUntil(p) : null };
  event.respondWith((async () => {
    try {
      const routed = await app.handle(event.request, ctx);
      if (routed) return routed;
      const res = await staticFile(event.request);
      app.metrics.hit();
      await app.afterResponse(ctx);
      return res;
    } catch (e) { console.log('edge error', e && e.message); return new Response(JSON.stringify({ error: 'Edge unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); }
  })());
});
