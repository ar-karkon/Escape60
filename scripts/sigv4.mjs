/* AWS Signature V4 (header auth) for S3-compatible storage, used by the release script.
   Node-only (node:crypto). Checked against AWS's published S3 examples in tests/sigv4.test.mjs. */
import { createHash, createHmac } from 'node:crypto';

export const sha256hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
/** URI-encode each path segment the way S3 expects (RFC 3986 unreserved characters stay literal). */
export const encodePath = (p) => p.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

/**
 * Sign a request. `path` must already be encoded (use encodePath). `headers` are the headers to sign
 * and must include x-amz-date and x-amz-content-sha256; host is added from `host`.
 * Returns the full header set to send (signed headers + Authorization).
 */
export function signV4({ method, host, path, query = '', headers, accessKey, secretKey, region, service = 's3' }) {
  const h = { host };
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  const amzDate = h['x-amz-date'], payload = h['x-amz-content-sha256'];
  if (!amzDate || !payload) throw Error('x-amz-date and x-amz-content-sha256 are required');
  const day = amzDate.slice(0, 8);
  const names = Object.keys(h).sort();
  const canonical = [method, path, query, names.map((n) => `${n}:${h[n]}\n`).join(''), names.join(';'), payload].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n');
  let k = hmac('AWS4' + secretKey, day);
  k = hmac(k, region); k = hmac(k, service); k = hmac(k, 'aws4_request');
  const signature = createHmac('sha256', k).update(toSign).digest('hex');
  const out = { ...h };
  delete out.host; // fetch sets Host itself
  out.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  return out;
}

export const amzDateOf = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
