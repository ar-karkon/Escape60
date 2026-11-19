/** Game service client (same origin): daily route, run tickets, live referee, final replay, rival ghost, leaderboard. */
const API_BASE = (globalThis.ESCAPE60_API_BASE || '').replace(/\/$/, '');
export async function request(path, options = {}, ms = 6500) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await res.json(); if (!res.ok) throw Object.assign(Error(data.error || 'Request failed'), { status: res.status }); return data;
  } finally { clearTimeout(timeout); }
}
export const today = () => request('/challenges/today');
export const startRun = (seed, car, spawn) => request('/runs/start', { method: 'POST', body: JSON.stringify({ seed, car, spawn }) });
/** Live referee: the edge re-simulates the newest inputs while the run is still being driven. */
export const liveCheck = (runId, token, trace, checkpoint) => request('/runs/live', { method: 'POST', body: JSON.stringify({ runId, token, trace, checkpoint }) }, 6000);
/** Final verdict. Starts from the last live checkpoint when there is one (only the last seconds are
    replayed); long remainders are replayed in chunks, each reply carrying a signed checkpoint. */
export async function finishRun(runId, token, trace, result, onProgress = () => {}, checkpoint = null) {
  for (let i = 0; i < 160; i++) {
    let r;
    try { r = await request('/runs/finish', { method: 'POST', body: JSON.stringify({ runId, token, trace, result, checkpoint }) }, 15000); }
    catch (e) { if (checkpoint && i === 0 && e.status === 401) { checkpoint = null; continue; } throw e; }
    if (!r.continue) return r;
    checkpoint = r.checkpoint; onProgress(r.progress);
  }
  throw Error('Replay did not finish');
}
/** The edge picks a ghost rival (the verified run just above `points`, or a friend's run by id). */
export function rival(seed, { points = null, not = null, id = null } = {}) {
  const q = new URLSearchParams({ seed });
  if (Number.isFinite(points)) q.set('points', String(points));
  if (not) q.set('not', not);
  if (id) q.set('id', id);
  return request(`/rival?${q}`, {}, 4000);
}
export const leaderboard = (seed, limit = 10) => request(`/leaderboard?seed=${encodeURIComponent(seed)}&limit=${limit}`);
