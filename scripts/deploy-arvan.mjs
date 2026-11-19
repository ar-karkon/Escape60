#!/usr/bin/env node
/* One-command release to Arvan from your own computer (no CI needed).

     npm run deploy                 test + build, upload changed files, guide the edge update, verify
     npm run deploy -- --dry-run    show what would be uploaded, change nothing
   Flags: --skip-build (use the existing dist/), --skip-tests, --force (upload every file),
          --no-wait (do not pause for the edge step; index.html is uploaded at the end anyway).

   The Object Storage keys come from S3_ACCESS_KEY / S3_SECRET_KEY or are asked for (hidden input).
   They are used for this run only and never written to disk.
   Optional env: S3_ENDPOINT, S3_REGION, STATIC_BUCKET, STATIC_ORIGIN, GAME_URL.
   Uploads every flat file of dist/web, including edge.html and the .br / .gz copies.

   Order matters: every new file is uploaded first (new hashed names do not disturb the live game),
   then the edge worker is replaced in the Arvan panel, and only then index.html switches players
   over to the new client, so old clients never talk to a new API for more than a few seconds. */
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signV4, encodePath, sha256hex, amzDateOf } from './sigv4.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run'), FORCE = args.has('--force'), WAIT = !args.has('--no-wait') && process.stdin.isTTY;
const ENDPOINT = (process.env.S3_ENDPOINT || 'https://s3.ir-central1.arvanstorage.ir').replace(/\/$/, '');
const REGION = process.env.S3_REGION || 'ir-central1';
const BUCKET = process.env.STATIC_BUCKET || 'escape60-game';
const STATIC_ORIGIN = (process.env.STATIC_ORIGIN || `https://${BUCKET}.s3.${REGION}.arvanstorage.ir`).replace(/\/$/, '');
const GAME_URL = (process.env.GAME_URL || 'https://escape60.lavanai2525-3qem7.arvanedge.ir').replace(/\/$/, '');
const TYPES = { br: 'application/octet-stream', gz: 'application/octet-stream', html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', json: 'application/json', woff2: 'font/woff2', png: 'image/png', jpg: 'image/jpeg', mp3: 'audio/mpeg', wav: 'audio/wav', md: 'text/plain; charset=utf-8', txt: 'text/plain; charset=utf-8', LICENSE: 'text/plain; charset=utf-8', webmanifest: 'application/manifest+json' };

const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, ok: (s) => `\x1b[32m${s}\x1b[0m`, warn: (s) => `\x1b[33m${s}\x1b[0m`, bad: (s) => `\x1b[31m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` };
const step = (s) => console.log('\n' + c.b('▶ ' + s));
const die = (s) => { console.error('\n' + c.bad('✖ ' + s)); process.exit(1); };
const kb = (n) => (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(question); };
    rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}
function run(cmd, list) {
  const r = spawnSync(cmd, list, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) die(`${cmd} ${list.join(' ')} failed`);
}
async function withRetry(fn, label) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= 3) throw Error(`${label}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
}

// ---------- S3 ----------
let keys = null;
async function s3(method, name, { body = null, headers = {} } = {}) {
  const u = new URL(ENDPOINT);
  const p = `${u.pathname.replace(/\/$/, '')}/${BUCKET}/${encodePath(name)}`;
  const signed = signV4({ method, host: u.host, path: p, region: REGION, ...keys, headers: { ...headers, 'x-amz-date': amzDateOf(), 'x-amz-content-sha256': sha256hex(body || '') } });
  return fetch(`${u.origin}${p}`, { method, headers: signed, body: body || undefined });
}
async function remoteEtag(name) {
  const res = await withRetry(() => s3('HEAD', name), `HEAD ${name}`);
  if (res.status === 404) return null;
  if (res.status === 403) die('Object Storage refused the keys (403). Check S3_ACCESS_KEY / S3_SECRET_KEY and that they can write to ' + BUCKET + '.');
  if (!res.ok) throw Error(`HEAD ${name} → ${res.status}`);
  return (res.headers.get('etag') || '').replace(/"/g, '');
}
async function upload(f) {
  const ext = f.name.includes('.') ? f.name.split('.').pop() : f.name;
  const base = { 'content-type': TYPES[ext] || 'application/octet-stream' };
  let res = await withRetry(() => s3('PUT', f.name, { body: f.body, headers: { ...base, 'x-amz-acl': 'public-read' } }), `PUT ${f.name}`);
  // Storage without canned-ACL support: the bucket itself is public, so a plain PUT is enough.
  if (res.status === 400 || res.status === 501) res = await withRetry(() => s3('PUT', f.name, { body: f.body, headers: base }), `PUT ${f.name}`);
  if (!res.ok) throw Error(`PUT ${f.name} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  console.log(`  ${c.ok('↑')} ${f.name} ${c.dim(kb(f.body.length))}`);
}
async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => { while (queue.length) await fn(queue.shift()); }));
}

// ---------- live checks ----------
async function health() {
  try {
    const res = await fetch(`${GAME_URL}/api/v1/health`, { headers: { 'cache-control': 'no-cache' } });
    return res.ok ? await res.json() : { status: `HTTP ${res.status}` };
  } catch (e) { return { status: 'unreachable: ' + e.message }; }
}
async function liveHtmlHas(text) {
  try { const res = await fetch(`${GAME_URL}/?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } }); return res.ok && (await res.text()).includes(text); } catch { return false; }
}
function copyToClipboard(text) {
  const tries = process.platform === 'win32' ? [['clip', []]] : process.platform === 'darwin' ? [['pbcopy', []]] : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['-b']]];
  for (const [cmd, a] of tries) { const r = spawnSync(cmd, a, { input: text }); if (r.status === 0) return true; }
  return false;
}

// ---------- main ----------
const { SIM_VERSION } = await import('../web/src/simulation.js');
const { API_VERSION } = await import('../edge/app.mjs');
console.log(c.b(`ESCAPE 60 → Arvan`) + c.dim(`  sim ${SIM_VERSION} · api ${API_VERSION} · bucket ${BUCKET} · ${GAME_URL}${DRY ? ' · DRY RUN' : ''}`));

if (!args.has('--skip-build')) {
  if (!args.has('--skip-tests')) { step('Tests'); run(process.execPath, ['--test', ...(await readdir(path.join(root, 'tests'))).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join('tests', f))]); }
  step('Build'); run(process.execPath, ['scripts/build.mjs']);
}
const webDir = path.join(root, 'dist/web'), workerFile = path.join(root, 'dist/edge/worker.js');
try { await stat(path.join(webDir, 'index.html')); await stat(workerFile); } catch { die('dist/ is missing — run without --skip-build.'); }

const files = [];
for (const e of await readdir(webDir, { withFileTypes: true })) {
  if (!e.isFile() || e.name.startsWith('.')) continue; // the edge serves the flat copies; assets/ is for other hosts
  const body = await readFile(path.join(webDir, e.name));
  files.push({ name: e.name, body, md5: createHash('md5').update(body).digest('hex') });
}
const html = files.find((f) => f.name === 'index.html');
const appName = html.body.toString().match(/src="\.\/(app-[A-Za-z0-9]+\.js)"/)?.[1];
if (!appName) die('index.html does not reference a built app-*.js');

keys = { accessKey: process.env.S3_ACCESS_KEY?.trim(), secretKey: process.env.S3_SECRET_KEY?.trim() };
if ((!keys.accessKey || !keys.secretKey) && !DRY) {
  if (!process.stdin.isTTY) die('Set S3_ACCESS_KEY and S3_SECRET_KEY (Arvan → Object Storage → access keys).');
  console.log(c.dim('\nArvan panel → Object Storage → مدیریت دسترسی (access keys). Input is hidden and not saved.'));
  keys.accessKey ||= await ask('S3 access key: ');
  keys.secretKey ||= await ask('S3 secret key: ', { hidden: true });
}

step('Compare with the bucket');
let changed = files;
if (keys.accessKey && keys.secretKey && !FORCE) {
  changed = [];
  await pool(files, 6, async (f) => { if ((await remoteEtag(f.name)) !== f.md5) changed.push(f); });
}
changed.sort((a, b) => a.name.localeCompare(b.name));
const assets = changed.filter((f) => f !== html), htmlChanged = changed.includes(html);
console.log(`  ${files.length} files · ${changed.length} to upload (${kb(changed.reduce((s, f) => s + f.body.length, 0))})`);
for (const f of changed) console.log(c.dim(`    ${f.name}`));
if (DRY) { console.log('\n' + c.warn('Dry run — nothing uploaded.')); process.exit(0); }

if (assets.length) { step('Upload new files'); await pool(assets, 4, upload); }

step('Edge worker (one manual step in the Arvan panel)');
const worker = await readFile(workerFile, 'utf8');
const before = await health();
if (before.api === API_VERSION && before.version === SIM_VERSION) console.log(c.ok('  The live edge already runs this API/simulation — nothing to do here.'));
else {
  const copied = copyToClipboard(worker);
  console.log(`  Live edge now: ${c.warn(JSON.stringify({ api: before.api, version: before.version, status: before.status }))}`);
  console.log(`  1. panel.arvancloud.ir → Edge Compute → escape60 → ویرایش کد (Edit code)`);
  console.log(`  2. Replace all code with ${c.b('dist/edge/worker.js')} ${c.dim(`(${kb(worker.length)})`)}${copied ? c.ok(' — already copied to your clipboard, just paste') : ''}`);
  console.log(`  3. Press انتشار (Publish)`);
  if (WAIT) {
    for (;;) {
      await ask(c.b('\n  Press Enter once it is published… '));
      const h = await health();
      if (h.api === API_VERSION && h.version === SIM_VERSION) { console.log(c.ok(`  ✔ Edge is live: api ${h.api}, sim ${h.version}, storage ${h.storage}, secured ${h.secured}`)); break; }
      console.log(c.warn(`  Edge still reports ${JSON.stringify(h)}`));
      if ((await ask('  Retry check (r) or continue anyway (c)? ')).toLowerCase().startsWith('c')) break;
    }
  } else console.log(c.warn('  Not waiting (--no-wait / no terminal): index.html is uploaded now; publish the worker right after.'));
}

if (htmlChanged) { step('Switch players to the new client'); await upload(html); }

step('Verify');
const pub = await fetch(`${STATIC_ORIGIN}/index.html?v=${Date.now()}`).catch(() => null);
console.log(pub?.ok ? c.ok(`  ✔ bucket serves index.html publicly`) : c.bad(`  ✖ ${STATIC_ORIGIN}/index.html → ${pub ? pub.status : 'unreachable'} (make the bucket/objects public)`));
let live = false;
for (let i = 0; i < 6 && !(live = await liveHtmlHas(appName)); i++) await new Promise((r) => setTimeout(r, 5000));
console.log(live ? c.ok(`  ✔ ${GAME_URL} serves the new client (${appName})`) : c.warn(`  … ${GAME_URL} does not show ${appName} yet (edge HTML cache is 30 s — reload in a minute)`));
const after = await health();
const apiOk = after.api === API_VERSION && after.version === SIM_VERSION;
console.log(apiOk ? c.ok(`  ✔ API ${after.api} · sim ${after.version} · storage ${after.storage} · secured ${after.secured}`) : c.bad(`  ✖ API reports ${JSON.stringify(after)} — publish dist/edge/worker.js in the panel`));
if (apiOk && after.storage !== 'arvan-object-storage') console.log(c.warn('  ! Leaderboard is in memory: set S3_ACCESS_KEY / S3_SECRET_KEY as encrypted edge variables.'));
// Precompressed delivery: the bundle must decode to exactly the bytes we built (fetch decodes br/gzip).
let packed = false;
try {
  const res = await fetch(`${GAME_URL}/${appName}`, { headers: { 'accept-encoding': 'br, gzip' } });
  const enc = res.headers.get('content-encoding') || 'identity', got = Buffer.from(await res.arrayBuffer());
  const local = files.find((f) => f.name === appName).body;
  packed = res.ok && got.equals(local);
  console.log(packed ? c.ok(`  ✔ ${appName} arrives as ${enc} and decodes byte-for-byte`) : c.bad(`  ✖ ${appName} (${enc}) does not match the build — set the edge variable PRECOMPRESSED to false and re-check`));
} catch (e) { console.log(c.bad(`  ✖ bundle check failed: ${e.message}`)); }
try {
  const [page, edge] = await Promise.all([fetch(`${GAME_URL}/edge`), fetch(`${GAME_URL}/api/v1/edge`).then((r) => r.json())]);
  console.log(page.ok && edge.features ? c.ok(`  ✔ /edge dashboard up · referee features: ${edge.features.join(', ')}`) : c.warn(`  … /edge → ${page.status}`));
} catch (e) { console.log(c.warn(`  … /edge check failed: ${e.message}`)); }
// AIaaS: configured, and today's briefing written by the model (the first call of a UTC day writes it).
if (apiOk) {
  if (!after.ai?.configured) console.log(c.warn('  ! AIaaS not configured — set the edge variable AI_API_KEY ("apikey …"); handwritten briefing/radio/crew chief in use.'));
  else {
    try {
      const day = await (await fetch(`${GAME_URL}/api/v1/challenges/today`)).json();
      const src = day.brief?.source;
      console.log(src === 'ai' ? c.ok(`  ✔ AIaaS ${after.ai.model}: today's briefing "${day.brief.theme?.en}" · ${day.rules?.contracts?.length} contracts`) : c.warn(`  … today's briefing source is "${src}" — the model call failed or timed out (see aiFails on /edge); it stays handwritten for today`));
    } catch (e) { console.log(c.warn(`  … briefing check failed: ${e.message}`)); }
  }
}
process.exitCode = live && apiOk && packed ? 0 : 2;
console.log('\n' + (live && apiOk && packed ? c.ok(c.b('Done. Optional full check: GAME_URL=' + GAME_URL + ' npm run test:browser')) : c.warn(c.b('Finished with warnings (see above).'))));
