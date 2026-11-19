/* Minimal S3 client for Arvan Object Storage using AWS Signature V4 over WebCrypto.
   Works in the Arvan Edge runtime and in Node 20+ (both expose globalThis.crypto.subtle). */
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(data) { return hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data)); }
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}
const encodeKey = (key) => key.split('/').map((p) => encodeURIComponent(p).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

/** Returns a store with get/put/del. `put` honours ifMatch / ifNoneMatch and returns false on 412. */
export function s3Store({ endpoint, region, bucket, accessKey, secretKey, fetchImpl = fetch }) {
  const base = new URL(endpoint);
  async function send(method, key, { body = '', headers = {} } = {}) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const day = amzDate.slice(0, 8);
    const path = `/${bucket}/${encodeKey(key)}`;
    const payloadHash = await sha256(body);
    const signed = { host: base.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
    const names = Object.keys(signed).sort();
    const canonical = [method, path, '', names.map((n) => `${n}:${signed[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
    const scope = `${day}/${region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
    let k = await hmac('AWS4' + secretKey, day);
    k = await hmac(k, region); k = await hmac(k, 's3'); k = await hmac(k, 'aws4_request');
    const signature = hex(await hmac(k, toSign));
    const auth = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
    return fetchImpl(`${base.origin}${path}`, { method, headers: { ...headers, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, Authorization: auth }, body: method === 'PUT' ? body : undefined });
  }
  return {
    kind: 'arvan-object-storage',
    async get(key) {
      const res = await send('GET', key);
      if (res.status === 404) return null;
      if (!res.ok) throw Error(`storage get ${res.status}`);
      return { body: await res.text(), etag: res.headers.get('etag') };
    },
    async put(key, body, { ifMatch, ifNoneMatch } = {}) {
      const headers = { 'Content-Type': 'application/json' };
      // Arvan Object Storage answers 412 to If-Match even when the ETag is current (verified live),
      // so compare-and-swap is a fresh ETag check immediately before an unconditional write.
      if (ifMatch) { const cur = await this.get(key); if (!cur || cur.etag !== ifMatch) return false; ifMatch = undefined; }
      if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch;
      let res = await send('PUT', key, { body, headers });
      // Storage that does not implement conditional writes: fall back to a plain PUT.
      if ((res.status === 501 || res.status === 400) && (ifMatch || ifNoneMatch)) {
        if (ifNoneMatch === '*' && (await this.get(key))) return false;
        res = await send('PUT', key, { body, headers: { 'Content-Type': 'application/json' } });
      }
      if (res.status === 412 || res.status === 409) return false;
      if (!res.ok) throw Error(`storage put ${res.status}`);
      return true;
    },
    async del(key) { await send('DELETE', key); },
  };
}

/** In-memory store with the same contract (tests, local dev, and Edge fallback when unconfigured). */
export function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial)); let n = 0;
  return {
    kind: 'memory', data,
    async get(key) { const v = data.get(key); return v ? { body: v.body, etag: v.etag } : null; },
    async put(key, body, { ifMatch, ifNoneMatch } = {}) {
      const cur = data.get(key);
      if (ifNoneMatch === '*' && cur) return false;
      if (ifMatch && (!cur || cur.etag !== ifMatch)) return false;
      data.set(key, { body, etag: `"${++n}"` }); return true;
    },
    async del(key) { data.delete(key); },
  };
}
