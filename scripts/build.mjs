/* Production build:
   dist/web/   static site (bundled + minified JS): the game (index.html) and the edge referee
               dashboard (edge.html). Assets are copied both under assets/ (any static host) and flat
               next to index.html (the edge proxy maps a request path to its basename). Every flat text
               file also gets Brotli (.br) and gzip (.gz) copies for the edge to negotiate.
   dist/edge/worker.js   single-file edge compute (game service, previews, cards, static proxy) with
               the sizes of this build baked in. */
import { build } from 'esbuild';
import { cp, mkdir, rm, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { brotliCompressSync, gzipSync, constants as Z } from 'node:zlib';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'dist'), web = path.join(out, 'web'), edge = path.join(out, 'edge');
await rm(out, { recursive: true, force: true });
await mkdir(web, { recursive: true }); await mkdir(edge, { recursive: true });

const client = await build({
  entryPoints: { app: path.join(root, 'web/src/main.js'), edge: path.join(root, 'web/src/edgepage.js') }, bundle: true, splitting: true, format: 'esm', minify: true,
  target: ['es2020', 'safari14'], outdir: web, entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]', metafile: true, legalComments: 'eof', logLevel: 'warning', logOverride: { 'commonjs-variable-in-esm': 'silent' },
});
const outNames = Object.keys(client.metafile.outputs).map((f) => path.basename(f));
const appFile = outNames.find((f) => /^app-.*\.js$/.test(f)), edgeFile = outNames.find((f) => /^edge-.*\.js$/.test(f));
const css = await readFile(path.join(root, 'web/style.css'), 'utf8');
const cssName = `style-${(await import('node:crypto')).createHash('sha256').update(css).digest('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}.css`;
await writeFile(path.join(web, cssName), css);
let html = await readFile(path.join(root, 'web/index.html'), 'utf8');
html = html.replace('<script type="module" src="./src/main.js"></script>', `<script type="module" src="./${appFile}"></script>`).replace('href="./style.css"', `href="./${cssName}"`);
if (!html.includes(appFile) || !html.includes(cssName)) throw Error('index.html rewrite failed');
await writeFile(path.join(web, 'index.html'), html);
let edgeHtml = await readFile(path.join(root, 'web/edge.html'), 'utf8');
edgeHtml = edgeHtml.replace('<script type="module" src="./src/edgepage.js"></script>', `<script type="module" src="./${edgeFile}"></script>`).replace('href="./style.css"', `href="./${cssName}"`);
if (!edgeHtml.includes(edgeFile) || !edgeHtml.includes(cssName)) throw Error('edge.html rewrite failed');
await writeFile(path.join(web, 'edge.html'), edgeHtml);
async function flat(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await flat(p);
    else { const dest = path.join(web, e.name); try { await stat(dest); throw Error('duplicate asset name ' + e.name); } catch (err) { if (err.code !== 'ENOENT') throw err; } await cp(p, dest); }
  }
}
await flat(path.join(root, 'web/assets'));
await cp(path.join(root, 'web/assets'), path.join(web, 'assets'), { recursive: true });
for (const f of ['three.LICENSE']) await cp(path.join(root, 'web/vendor', f), path.join(web, f));

// Brotli + gzip copies of every flat text file; the edge serves the best one the browser accepts.
const sizes = {};
for (const f of await readdir(web)) {
  if (!/\.(js|css|html|svg|json|md|txt)$/.test(f)) continue;
  const raw = await readFile(path.join(web, f));
  const br = brotliCompressSync(raw, { params: { [Z.BROTLI_PARAM_QUALITY]: 11, [Z.BROTLI_PARAM_SIZE_HINT]: raw.length } }), gz = gzipSync(raw, { level: 9 });
  sizes[f] = { raw: raw.length };
  if (br.length < raw.length * 0.92) { await writeFile(path.join(web, f + '.br'), br); sizes[f].br = br.length; }
  if (gz.length < raw.length * 0.92) { await writeFile(path.join(web, f + '.gz'), gz); sizes[f].gz = gz.length; }
}
await build({ entryPoints: [path.join(root, 'edge/worker.js')], bundle: true, format: 'iife', minify: true, target: 'es2022', outfile: path.join(edge, 'worker.js'), legalComments: 'none', logLevel: 'warning', define: { __ASSET_SIZES__: JSON.stringify(sizes) } });
const files = await readdir(web);
const size = async (f) => (await stat(f)).size;
const a = sizes[appFile];
console.log(`dist/web: ${files.length} files · app ${(a.raw / 1024).toFixed(0)} KB (Brotli ${(a.br / 1024).toFixed(0)} KB, gzip ${(a.gz / 1024).toFixed(0)} KB) · edge page ${(sizes[edgeFile].raw / 1024).toFixed(0)} KB`);
console.log(`dist/edge/worker.js: ${(await size(path.join(edge, 'worker.js')) / 1024).toFixed(1)} KB`);
