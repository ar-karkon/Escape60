/* Production build:
   dist/web/   static site (bundled + minified JS). Assets are copied both under assets/ (any static
               host) and flat next to index.html (the edge proxy maps a request path to its basename).
   dist/edge/worker.js   single-file edge compute (API + static proxy) */
import { build } from 'esbuild';
import { cp, mkdir, rm, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'dist'), web = path.join(out, 'web'), edge = path.join(out, 'edge');
await rm(out, { recursive: true, force: true });
await mkdir(web, { recursive: true }); await mkdir(edge, { recursive: true });

const client = await build({
  entryPoints: { app: path.join(root, 'web/src/main.js') }, bundle: true, splitting: true, format: 'esm', minify: true,
  target: ['es2020', 'safari14'], outdir: web, entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]', metafile: true, legalComments: 'eof', logLevel: 'warning', logOverride: { 'commonjs-variable-in-esm': 'silent' },
});
const appFile = Object.keys(client.metafile.outputs).map((f) => path.basename(f)).find((f) => /^app-.*\.js$/.test(f));
const css = await readFile(path.join(root, 'web/style.css'), 'utf8');
const cssName = `style-${(await import('node:crypto')).createHash('sha256').update(css).digest('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}.css`;
await writeFile(path.join(web, cssName), css);
let html = await readFile(path.join(root, 'web/index.html'), 'utf8');
html = html.replace('<script type="module" src="./src/main.js"></script>', `<script type="module" src="./${appFile}"></script>`).replace('href="./style.css"', `href="./${cssName}"`);
if (!html.includes(appFile) || !html.includes(cssName)) throw Error('index.html rewrite failed');
await writeFile(path.join(web, 'index.html'), html);
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

await build({ entryPoints: [path.join(root, 'edge/worker.js')], bundle: true, format: 'iife', minify: true, target: 'es2022', outfile: path.join(edge, 'worker.js'), legalComments: 'none', logLevel: 'warning' });
const files = await readdir(web);
const size = async (f) => (await stat(f)).size;
console.log(`dist/web: ${files.length} files · app ${(await size(path.join(web, appFile)) / 1024).toFixed(0)} KB`);
console.log(`dist/edge/worker.js: ${(await size(path.join(edge, 'worker.js')) / 1024).toFixed(1)} KB`);
