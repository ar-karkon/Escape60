/* Static delivery at the edge. Game files live flat in a public bucket; the edge is the only public
   origin. For text assets the build also uploads Brotli (.br) and gzip (.gz) copies, and the edge
   picks the best one the browser accepts — e.g. the 770 KB game bundle travels as ~190 KB of Brotli.
   Byte ranges (Safari audio) pass straight through. */
export const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', json: 'application/json', woff2: 'font/woff2', png: 'image/png', jpg: 'image/jpeg', mp3: 'audio/mpeg', wav: 'audio/wav', md: 'text/plain; charset=utf-8', txt: 'text/plain; charset=utf-8', webmanifest: 'application/manifest+json' };
export const ROUTES = { '/': 'index.html', '/edge': 'edge.html', '/edge/': 'edge.html' };
const COMPRESSIBLE = /\.(js|css|html|svg|json|md|txt)$/;

/** `sizes`: { file: { raw, br, gz } } from the build (lets the edge skip variants that do not exist
    and count the bytes it saved); `precompressed`: false disables content negotiation entirely. */
export function createStatic({ origin, fetchImpl = (...a) => fetch(...a), sizes = null, precompressed = true, metrics = null }) {
  origin = String(origin).replace(/\/$/, '');
  return async function staticFile(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const url = new URL(req.url);
    const name = ROUTES[url.pathname] || url.pathname.split('/').pop();
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(name) || name.startsWith('.')) return new Response('Not found', { status: 404 });
    const range = req.headers.get('range');
    const accept = String(req.headers.get('accept-encoding') || '').toLowerCase();
    const info = sizes?.[name];
    let upstream = null, encoding = null;
    if (precompressed && !range && COMPRESSIBLE.test(name)) {
      for (const [enc, ext] of [['br', 'br'], ['gzip', 'gz']]) {
        if (!new RegExp(`(^|[ ,])${enc}($|[ ,;])`).test(accept)) continue;
        if (sizes && !info?.[ext]) continue;
        const r = await fetchImpl(`${origin}/${name}.${ext}`, { method: req.method });
        if (r.ok) { upstream = r; encoding = enc; break; }
      }
    }
    if (!upstream) {
      const headers = {}; if (range) headers.Range = range;
      upstream = await fetchImpl(`${origin}/${name}`, { method: req.method, headers });
    }
    if (upstream.status === 404 || upstream.status === 403) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    const ext = name.split('.').pop().toLowerCase();
    const out = new Headers();
    for (const h of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
    out.set('Content-Type', TYPES[ext] || 'application/octet-stream');
    if (encoding) out.set('Content-Encoding', encoding);
    if (COMPRESSIBLE.test(name)) out.set('Vary', 'Accept-Encoding');
    // Hashed bundles are immutable; HTML revalidates quickly so new builds reach players at once.
    out.set('Cache-Control', ext === 'html' ? 'public, max-age=30' : /-[A-Z0-9]{8}\.(js|css)$/.test(name) ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
    out.set('X-Content-Type-Options', 'nosniff');
    out.set('Referrer-Policy', 'no-referrer');
    out.set('X-Escape60-Edge', encoding ? `1; ${encoding}` : '1');
    if (ext === 'html') out.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (metrics) {
      metrics.add('static');
      const len = Number(upstream.headers.get('content-length')) || 0;
      metrics.add('staticBytes', len);
      if (encoding && info?.raw) metrics.add('savedBytes', Math.max(0, info.raw - len));
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  };
}
