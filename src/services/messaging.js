import dgram from 'node:dgram';
import net from 'node:net';
import os from 'node:os';
import tls from 'node:tls';
import WebSocket from 'ws';
import snmp from 'net-snmp';
import { clientTest, hostOf, portOf, timeoutMs, tlsSummary, withTimeout } from './util.js';

const GRACE_MS = 15000; // keep a session alive this long after its event stream drops
const asText = (d, isBinary) => (isBinary ? `[binary ${d.length}B] ${Buffer.from(d).toString('hex').slice(0, 200)}` : d.toString());

// Validates the form and returns what `new WebSocket()` needs.
const wsTarget = (b) => {
  let url;
  try { url = new URL(String(b.url || '').trim()); } catch { throw new Error('a full URL is required, e.g. wss://echo.example.com/socket'); }
  if (!/^wss?:$/.test(url.protocol)) throw new Error('URL must start with ws:// or wss://');
  const timeout = timeoutMs(b);
  const headers = {};
  for (const line of String(b.headers || '').split('\n')) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i < 1) throw new Error(`invalid header line "${line.trim()}" (use Name: value)`);
    headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (b.pass) headers.Authorization = `Bearer ${b.pass}`;
  const protocols = b.protocols ? String(b.protocols).split(/[\s,]+/).filter(Boolean) : undefined;
  return { url, timeout, protocols, opts: { headers, handshakeTimeout: timeout, rejectUnauthorized: b.rejectUnauthorized !== false } };
};

const whenOpen = (ws, timeout) => withTimeout(new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
  ws.once('unexpected-response', (_q, res) => reject(new Error(`server refused upgrade: HTTP ${res.statusCode} ${res.statusMessage}`)));
}), timeout + 500, 'handshake');

// Service contract: { id, name, routes(router) }
export function createWebSocketService() {
  return {
    id: 'websocket',
    name: 'WebSocket',
    routes(router) {
      // Live mode: a persistent connection per browser tab (sid), frames streamed over SSE
      const sessions = new Map(); // sid -> { ws, status, listeners:Set<res>, timer }
      const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      // Frames that arrive before the browser's event stream attaches (e.g. a server greeting) are kept and replayed
      const emit = (s, event, data) => {
        if (!s.listeners.size && event === 'message' && s.backlog.length < 200) s.backlog.push(data);
        for (const r of s.listeners) r.write(frame(event, data));
      };
      const setStatus = (s, status, error) => { s.status = status; emit(s, 'status', { status, error }); };
      const drop = (sid) => {
        const s = sessions.get(sid); if (!s) return;
        clearTimeout(s.timer);
        s.ws?.terminate();
        for (const r of s.listeners) r.end();
        sessions.delete(sid);
      };
      const need = (req, res) => {
        const s = sessions.get(req.params.sid);
        if (!s || s.status !== 'connected') { res.status(409).json({ ok: false, error: 'not connected' }); return null; }
        return s;
      };

      router.post('/session/connect', async (req, res) => {
        const b = req.body ?? {};
        const started = Date.now();
        const log = [];
        const push = (l) => log.push(`+${Date.now() - started}ms ${l}`);
        const answer = (payload) => res.json({ ms: Date.now() - started, log, ...payload });
        try {
          if (!b.sid) throw new Error('sid is required');
          drop(b.sid);
          const { url, timeout, protocols, opts } = wsTarget(b);
          push(`connecting ${url.href}`);
          const s = { ws: null, status: 'connecting', listeners: new Set(), timer: null, backlog: [] };
          sessions.set(b.sid, s);
          const ws = s.ws = new WebSocket(url, protocols, opts);
          ws.on('error', (e) => { if (s.status === 'connected') setStatus(s, 'error', e.message); }); // failures while connecting are reported by the catch below
          ws.on('message', (d, isBinary) => emit(s, 'message', { dir: 'in', payload: asText(d, isBinary), ts: Date.now() }));
          ws.on('pong', () => emit(s, 'message', { dir: 'sys', payload: 'pong', ts: Date.now() }));
          ws.on('close', (code, reason) => {
            if (s.status === 'connected') setStatus(s, 'disconnected', `closed by server (${code}${reason.length ? ' ' + reason : ''})`);
          });
          await whenOpen(ws, timeout);
          push(`open${ws.protocol ? ` (subprotocol ${ws.protocol})` : ''}`);
          setStatus(s, 'connected');
          answer({ ok: true });
        } catch (e) {
          push('ERROR ' + e.message);
          drop(b.sid);
          answer({ ok: false, error: e.message });
        }
      });

      router.get('/session/:sid/events', (req, res) => {
        const s = sessions.get(req.params.sid);
        if (!s) return res.sendStatus(404);
        res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.flushHeaders();
        clearTimeout(s.timer);
        s.listeners.add(res);
        res.write(frame('status', { status: s.status }));
        for (const m of s.backlog.splice(0)) res.write(frame('message', m));
        req.on('close', () => {
          s.listeners.delete(res);
          if (!s.listeners.size) s.timer = setTimeout(() => drop(req.params.sid), GRACE_MS);
        });
      });

      router.post('/session/:sid/send', (req, res) => {
        const s = need(req, res); if (!s) return;
        const text = String(req.body?.message ?? '');
        if (!text) return res.status(400).json({ ok: false, error: 'message is empty' });
        s.ws.send(text, (e) => (e ? res.status(400).json({ ok: false, error: e.message }) : res.json({ ok: true })));
      });
      router.post('/session/:sid/ping', (req, res) => {
        const s = need(req, res); if (!s) return;
        s.ws.ping(); res.json({ ok: true });
      });
      router.post('/session/:sid/disconnect', (req, res) => { drop(req.params.sid); res.json({ ok: true }); });

      // Client mode: one-shot test (connect, optionally send, wait for a reply)
      router.post('/client/test', clientTest(async (b, push) => {
        const { url, timeout, protocols, opts } = wsTarget(b);
        const listen = Math.min(Math.max(Number(b.listenSeconds) || 3, 0), 30) * 1000;
        const received = [];
        push(`connecting ${url.href}`);
        const ws = new WebSocket(url, protocols, opts);
        try {
          await whenOpen(ws, timeout);
          push(`open${ws.protocol ? ` (subprotocol ${ws.protocol})` : ''}`);
          ws.on('message', (d, isBinary) => { const t = asText(d, isBinary); received.push(t); push(`RECV ${t.slice(0, 500)}`); });
          if (b.message) { ws.send(String(b.message)); push(`SENT ${String(b.message).slice(0, 500)}`); }
          const want = String(b.expect || '');
          await new Promise((resolve) => {
            const end = setTimeout(resolve, b.message || b.expect ? listen : Math.min(listen, 1000));
            ws.on('message', (d) => { if (want && d.toString().includes(want)) { clearTimeout(end); resolve(); } });
            ws.once('close', (code) => { push(`closed by server (${code})`); clearTimeout(end); resolve(); });
          });
          if (want && !received.some((m) => m.includes(want))) throw new Error(`no message containing "${want}" within ${listen / 1000}s`);
          return { response: `open · ${received.length} message(s) received`, received };
        } finally {
          ws.terminate();
        }
      }));
    },
  };
}

const FACILITIES = ['kern', 'user', 'mail', 'daemon', 'auth', 'syslog', 'lpr', 'news', 'uucp', 'cron', 'authpriv', 'ftp', 'ntp', 'audit', 'alert', 'clock', 'local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7'];
const SEVERITIES = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];

export function createSyslogService() {
  return {
    id: 'syslog',
    name: 'Syslog',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        const proto = b.protocol || 'udp'; // udp | tcp | tls
        const port = portOf(b, proto === 'tls' ? 6514 : 514);
        const timeout = timeoutMs(b, 5);
        const fac = FACILITIES.indexOf(b.facility || 'local0');
        const sev = SEVERITIES.indexOf(b.severity || 'info');
        if (fac < 0 || sev < 0) throw new Error('invalid facility or severity');
        const app = String(b.appName || 'does-it-work').replace(/\s/g, '-');
        const text = String(b.message || 'test message from does-it-work');
        const pri = fac * 8 + sev;
        const me = os.hostname().replace(/\s/g, '-') || '-';
        const now = new Date();
        const msg = b.format === 'rfc3164'
          ? `<${pri}>${now.toLocaleString('en-US', { month: 'short' })} ${String(now.getDate()).padStart(2)} ${now.toTimeString().slice(0, 8)} ${me} ${app}[${process.pid}]: ${text}`
          : `<${pri}>1 ${now.toISOString()} ${me} ${app} ${process.pid} - - ${text}`;
        push(`sending via ${proto.toUpperCase()} to ${host}:${port}: ${msg}`);
        if (proto === 'udp') {
          const sock = dgram.createSocket(net.isIPv6(host) ? 'udp6' : 'udp4');
          try {
            await withTimeout(new Promise((resolve, reject) => sock.send(msg, port, host, (e) => (e ? reject(e) : resolve()))), timeout, 'send');
          } finally { sock.close(); }
          push('datagram handed to the network (UDP gives no delivery confirmation; check the receiver)');
          return { response: 'sent (UDP, unconfirmed)' };
        }
        const socket = await withTimeout(new Promise((resolve, reject) => {
          const s = proto === 'tls'
            ? tls.connect({ host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: b.rejectUnauthorized !== false }, () => resolve(s))
            : net.connect({ host, port }, () => resolve(s));
          s.once('error', reject);
        }), timeout, 'connect');
        try {
          if (proto === 'tls') push(tlsSummary(socket));
          await withTimeout(new Promise((resolve, reject) => { socket.once('error', reject); socket.end(msg + '\n', resolve); }), timeout, 'send');
          push('message written and connection closed cleanly');
          return { response: `sent (${proto.toUpperCase()})` };
        } finally { socket.destroy(); }
      }));
    },
  };
}

const OIDS = { sysDescr: '1.3.6.1.2.1.1.1.0', sysUpTime: '1.3.6.1.2.1.1.3.0', sysName: '1.3.6.1.2.1.1.5.0' };
const oidsOf = (text) => {
  const list = String(text || '').split(/[\s,]+/).filter(Boolean);
  if (!list.length) return Object.values(OIDS);
  for (const o of list) if (!/^\.?\d+(\.\d+)+$/.test(o)) throw new Error(`invalid OID "${o}" (use dotted numbers such as 1.3.6.1.2.1.1.1.0)`);
  return list.map((o) => o.replace(/^\./, ''));
};

export function createSnmpService() {
  return {
    id: 'snmp',
    name: 'SNMP',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        const port = portOf(b, 161);
        const timeout = timeoutMs(b, 5);
        const version = b.version === '1' ? snmp.Version1 : snmp.Version2c;
        const oids = oidsOf(b.oids);
        const session = snmp.createSession(host, b.pass || 'public', { port, version, timeout, retries: 0, transport: net.isIPv6(host) ? 'udp6' : 'udp4' });
        session.on('error', () => {});
        try {
          push(`GET ${oids.join(' ')} from ${host}:${port} (SNMP ${b.version === '1' ? 'v1' : 'v2c'}, community ********)`);
          const varbinds = await new Promise((resolve, reject) => {
            session.get(oids, (err, vbs) => (err ? reject(err.name === 'RequestTimedOutError' ? new Error(`no reply within ${timeout / 1000}s (wrong host, port or community?)`) : err) : resolve(vbs)));
          });
          const bad = [];
          for (const vb of varbinds) {
            if (snmp.isVarbindError(vb)) { push(`${vb.oid}: ${snmp.varbindError(vb)}`); bad.push(vb.oid); continue; }
            push(`${vb.oid} = ${Buffer.isBuffer(vb.value) ? vb.value.toString().trim() : vb.value}`);
          }
          if (bad.length === varbinds.length) throw new Error('every requested OID returned an error');
          const name = varbinds.find((v) => v.oid === OIDS.sysName && !snmp.isVarbindError(v));
          return { response: `${varbinds.length - bad.length} value(s)${name ? ` · ${name.value.toString()}` : ''}` };
        } finally {
          session.close();
        }
      }));
    },
  };
}
