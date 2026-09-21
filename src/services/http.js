import http from 'node:http';
import https from 'node:https';
import { clientTest, timeoutMs, tlsSummary } from './util.js';

const MAX_BODY = 64 * 1024;
const PREVIEW = 2000;

const statusMatcher = (spec) => {
  const parts = String(spec || '2xx').split(',').map((s) => s.trim()).filter(Boolean);
  const tests = parts.map((p) => {
    if (/^\dxx$/i.test(p)) return (c) => Math.floor(c / 100) === Number(p[0]);
    const range = p.match(/^(\d{3})-(\d{3})$/);
    if (range) return (c) => c >= Number(range[1]) && c <= Number(range[2]);
    if (/^\d{3}$/.test(p)) return (c) => c === Number(p);
    throw new Error(`invalid expected status "${p}" (use e.g. 200, 200,204, 2xx or 200-299)`);
  });
  return (code) => tests.some((t) => t(code));
};

const parseHeaders = (text) => {
  const h = {};
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i < 1) throw new Error(`invalid header line "${line.trim()}" (use Name: value)`);
    h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return h;
};

const maskHeaders = (h) => Object.entries(h).map(([k, v]) => `${k}: ${/^(authorization|proxy-authorization|cookie|x-api-key)$/i.test(k) ? '********' : v}`);

const once = (url, { method, headers, body, verify, timeout, push }) => new Promise((resolve, reject) => {
  const secure = url.protocol === 'https:';
  const req = (secure ? https : http).request(url, {
    method, headers, agent: false, rejectUnauthorized: verify, signal: AbortSignal.timeout(timeout),
  }, (res) => {
    const chunks = [];
    let size = 0;
    res.on('data', (c) => { if (size < MAX_BODY) chunks.push(c); size += c.length; });
    res.on('end', () => resolve({ res, size, text: Buffer.concat(chunks).toString('utf8') }));
    res.on('error', reject);
  });
  req.on('socket', (s) => { if (secure) s.once('secureConnect', () => push(tlsSummary(s))); });
  req.on('error', (e) => reject(e.name === 'TimeoutError' || e.name === 'AbortError' ? new Error(`request timed out after ${timeout / 1000}s`) : e));
  req.end(body);
});

// Service contract: { id, name, routes(router) }
export function createHttpService() {
  return {
    id: 'http',
    name: 'HTTP',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        let url;
        try { url = new URL(String(b.url || '').trim()); } catch { throw new Error('a full URL is required, e.g. https://example.com/health'); }
        if (!/^https?:$/.test(url.protocol)) throw new Error('URL must start with http:// or https://');
        const isOk = statusMatcher(b.expected);
        const timeout = timeoutMs(b);
        const verify = b.rejectUnauthorized !== false;
        let method = String(b.method || 'GET').toUpperCase();
        let body = ['GET', 'HEAD'].includes(method) || !b.body ? undefined : Buffer.from(String(b.body));
        const headers = parseHeaders(b.headers);
        const has = (n) => Object.keys(headers).some((k) => k.toLowerCase() === n);
        if (b.auth === 'basic' && !has('authorization')) headers.Authorization = 'Basic ' + Buffer.from(`${b.user ?? ''}:${b.pass ?? ''}`).toString('base64');
        if (b.auth === 'bearer' && !has('authorization')) headers.Authorization = `Bearer ${b.pass ?? ''}`;
        if (body && !has('content-type')) headers['Content-Type'] = /^\s*[{[]/.test(String(b.body)) ? 'application/json' : 'text/plain';
        if (!has('user-agent')) headers['User-Agent'] = 'does-it-work/0.1';

        let result;
        for (let hop = 0; ; hop++) {
          const h = { ...headers, ...(body ? { 'Content-Length': body.length } : {}) };
          push(`${method} ${url.href}`);
          for (const l of maskHeaders(h)) push(`> ${l}`);
          result = await once(url, { method, headers: h, body, verify, timeout, push });
          const { res } = result;
          push(`< HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}`);
          for (const [k, v] of Object.entries(res.headers)) push(`< ${k}: ${v}`);
          const loc = res.headers.location;
          if (!b.follow || !loc || ![301, 302, 303, 307, 308].includes(res.statusCode)) break;
          if (hop >= 5) throw new Error('too many redirects');
          const next = new URL(loc, url);
          if (next.origin !== url.origin) for (const k of Object.keys(headers)) if (/^(authorization|cookie)$/i.test(k)) delete headers[k];
          if (res.statusCode !== 307 && res.statusCode !== 308 && method !== 'HEAD') {
            method = 'GET'; body = undefined;
            for (const k of Object.keys(headers)) if (/^content-type$/i.test(k)) delete headers[k];
          }
          push(`redirect -> ${next.href}`);
          url = next;
        }
        const { res, size, text } = result;
        push(`body ${size}B${size > MAX_BODY ? ` (first ${MAX_BODY / 1024}KB read)` : ''}`);
        if (text) push(text.length > PREVIEW ? text.slice(0, PREVIEW) + '…' : text);
        const status = `${res.statusCode} ${res.statusMessage}`;
        if (!isOk(res.statusCode)) throw Object.assign(new Error(`unexpected status ${status} (expected ${b.expected || '2xx'})`), { code: res.statusCode });
        push(`STATUS OK (${status})`);
        return { response: status };
      }));
    },
  };
}
