/* Edge telemetry. Counters live in the isolate and are merged into object storage at most every
   FLUSH_MS (and never on the hot path when the runtime offers waitUntil), so the /edge dashboard
   shows real totals across all edge nodes without a storage write per request. No personal data:
   only counts, reject reasons and the public callsigns of accepted runs. */
const FLUSH_MS = 15000;
const blank = () => ({ c: {}, rejects: {}, recent: [] });
const addAll = (into, from) => { for (const [k, v] of Object.entries(from || {})) into[k] = Math.round(((into[k] || 0) + v) * 10) / 10; return into; };

export function createMetrics({ now, update, readJson, log = () => {} }) {
  const isolate = Math.random().toString(36).slice(2, 8);
  const started = now();
  let local = blank(), lastFlush = started, flushing = null, served = 0, view = null;
  const dirty = () => Object.keys(local.c).length || Object.keys(local.rejects).length || local.recent.length;
  const day = () => new Date(now()).toISOString().slice(0, 10);
  const m = {
    isolate, started,
    add(name, n = 1) { if (n) local.c[name] = (local.c[name] || 0) + n; },
    reject(reason) { local.rejects[reason] = (local.rejects[reason] || 0) + 1; m.add('rejects'); },
    recent(entry) { local.recent.unshift(entry); if (local.recent.length > 12) local.recent.length = 12; },
    hit() { served++; },
    due() { return dirty() && now() - lastFlush > FLUSH_MS; },
    /** Merge this isolate's counters into the day and all-time documents. */
    flush() {
      if (flushing || !dirty()) return flushing || Promise.resolve();
      const batch = local; local = blank(); lastFlush = now();
      const date = day();
      flushing = Promise.all([
        update(`metrics/v1/day/${date}.json`, (d = { date, ...blank(), isolates: [] }) => {
          addAll(d.c, batch.c); addAll(d.rejects, batch.rejects);
          d.recent = [...batch.recent, ...(d.recent || [])].slice(0, 12);
          if (!d.isolates.includes(isolate)) d.isolates = [...d.isolates, isolate].slice(-64);
          return d;
        }),
        update('metrics/v1/total.json', (d = { since: date, ...blank() }) => { addAll(d.c, batch.c); addAll(d.rejects, batch.rejects); delete d.recent; return d; }),
      ]).catch((e) => { log('metrics flush', e.message); addAll(local.c, batch.c); addAll(local.rejects, batch.rejects); })
        .finally(() => { flushing = null; view = null; });
      return flushing;
    },
    /** Persisted totals plus this isolate's unflushed counters. */
    async snapshot() {
      if (!view || now() - view.at > 3000) {
        const date = day();
        const [d, t] = await Promise.all([readJson(`metrics/v1/day/${date}.json`), readJson('metrics/v1/total.json')]);
        view = { at: now(), today: d?.value || { date, ...blank(), isolates: [] }, total: t?.value || { since: date, ...blank() } };
      }
      const today = JSON.parse(JSON.stringify(view.today)), total = JSON.parse(JSON.stringify(view.total));
      addAll(today.c, local.c); addAll(today.rejects, local.rejects); addAll(total.c, local.c); addAll(total.rejects, local.rejects);
      today.recent = [...local.recent, ...(today.recent || [])].slice(0, 12);
      if (!today.isolates?.includes(isolate)) today.isolates = [...(today.isolates || []), isolate];
      return { today, total, isolate: { id: isolate, uptimeS: Math.round((now() - started) / 1000), served } };
    },
  };
  return m;
}
