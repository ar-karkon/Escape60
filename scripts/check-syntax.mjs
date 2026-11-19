// Syntax-check every browser/server module without a bundler.
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const roots = ['web/src', 'server', 'edge', 'scripts'];
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) await walk(p);
    else if (/\.(m?js|cjs)$/.test(e.name)) files.push(p);
  }
}
for (const r of roots) await walk(r);
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
console.log(`Syntax OK: ${files.length} files`);
