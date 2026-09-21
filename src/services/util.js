// Shared helpers for "client/test" services.

// Wraps a test body: `run(b, push)` returns extra fields for the result, or throws to fail.
export const clientTest = (run) => async (req, res) => {
  const b = req.body ?? {};
  const started = Date.now();
  const log = [];
  const push = (l) => log.push(`+${Date.now() - started}ms ${l}`);
  try {
    const extra = await run(b, push);
    res.json({ ok: true, ...extra, ms: Date.now() - started, log });
  } catch (e) {
    push('ERROR: ' + e.message);
    res.json({ ok: false, error: e.message, code: e.code, ms: Date.now() - started, log });
  }
};

export const hostOf = (b) => {
  if (!b.host) throw new Error('host is required');
  const host = String(b.host).trim();
  if (!/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$|^\[?[0-9A-Fa-f:]+\]?$/.test(host)) {
    throw new Error(`invalid host "${host}": enter a bare hostname (no "://", path or port)`);
  }
  return host.replace(/^\[|\]$/g, '');
};

export const portOf = (b, def) => {
  const port = b.port === '' || b.port == null ? def : Number(b.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be a number between 1 and 65535');
  return port;
};

export const timeoutMs = (b, def = 10) => Math.min(Math.max(Number(b.timeout) || def, 1), 60) * 1000;

export const withTimeout = (promise, ms, what) => {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms); }),
  ]).finally(() => clearTimeout(t));
};

// Splits a command line into words, honouring "double" and 'single' quotes.
export const splitArgs = (line) => [...String(line).matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g)].map((m) => m[1]?.replace(/\\(.)/g, '$1') ?? m[2] ?? m[3]);

export const tlsSummary = (s) => {
  const c = s.getPeerCertificate?.();
  return `TLS ${s.getProtocol?.() ?? '?'} ${s.getCipher?.()?.name ?? ''}` + (c?.subject ? `, cert CN=${c.subject.CN} expires ${c.valid_to} (${s.authorized ? 'trusted' : 'NOT trusted: ' + s.authorizationError})` : '');
};
