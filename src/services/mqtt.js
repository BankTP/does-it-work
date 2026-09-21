import mqttLib from 'mqtt';

const asText = (buf) => {
  const s = Buffer.from(buf).toString('utf8');
  return s.includes('\uFFFD') ? `[binary ${buf.length}B] ${Buffer.from(buf).toString('hex')}` : s;
};

const brokerOf = (b) => {
  if (!b.host) throw new Error('host is required');
  const protocol = b.protocol || 'mqtt'; // mqtt | mqtts | ws | wss
  const p = Number(b.port) || ({ mqtt: 1883, mqtts: 8883, ws: 80, wss: 443 })[protocol];
  const wsPath = protocol.startsWith('ws') ? (b.path || '/mqtt').replace(/^(?!\/)/, '/') : '';
  const timeout = Math.min(Number(b.timeout) || 10, 60) * 1000;
  return {
    url: `${protocol}://${b.host}:${p}${wsPath}`,
    timeout,
    opts: {
      clientId: b.clientId || `tester-${Math.random().toString(16).slice(2, 8)}`,
      username: b.user || undefined,
      password: b.pass || undefined,
      rejectUnauthorized: b.rejectUnauthorized !== false,
      protocolVersion: Number(b.version) || 4,
      connectTimeout: timeout,
      reconnectPeriod: 0,
      clean: true,
    },
  };
};

const GRACE_MS = 15000; // keep a session alive this long after its event stream drops

// Service contract: { id, name, routes(router) }
export function createMqttService() {
  return {
    id: 'mqtt',
    name: 'MQTT',
    routes(router) {
      // Live mode: a persistent connection per browser tab (sid), events streamed over SSE
      const sessions = new Map(); // sid -> { client, status, listeners:Set<res>, timer }
      const emit = (s, event, data) => { for (const r of s.listeners) r.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
      const setStatus = (s, status, error) => { s.status = status; emit(s, 'status', { status, error }); };
      const drop = (sid) => {
        const s = sessions.get(sid); if (!s) return;
        clearTimeout(s.timer);
        s.client?.end(true);
        for (const r of s.listeners) r.end();
        sessions.delete(sid);
      };
      const need = (req, res) => {
        const s = sessions.get(req.params.sid);
        if (!s || s.status !== 'connected') { res.status(409).json({ ok: false, error: 'not connected' }); return null; }
        return s;
      };

      router.post('/session/connect', (req, res) => {
        const b = req.body ?? {};
        const started = Date.now();
        const log = [];
        const push = (l) => log.push(`+${Date.now() - started}ms ${l}`);
        let answered = false;
        const answer = (payload) => { if (!answered) { answered = true; if (!payload.ok) drop(b.sid); res.json({ ms: Date.now() - started, log, ...payload }); } };
        try {
          if (!b.sid) throw new Error('sid is required');
          drop(b.sid);
          const { url, opts, timeout } = brokerOf(b);
          push(`connecting ${url}`);
          const s = { client: null, status: 'connecting', listeners: new Set(), timer: null };
          sessions.set(b.sid, s);
          const client = s.client = mqttLib.connect(url, opts);
          client.on('error', (e) => {
            push('ERROR ' + e.message);
            setStatus(s, 'error', e.message);
            answer({ ok: false, error: e.message || String(e.code || e) });
          });
          client.on('close', () => {
            if (s.status !== 'error') setStatus(s, 'disconnected');
            answer({ ok: false, error: 'connection closed' });
          });
          client.on('message', (topic, m, pkt) => emit(s, 'message', { topic, payload: asText(m), qos: pkt.qos, retain: pkt.retain, ts: Date.now() }));
          client.on('connect', (ack) => {
            push(`CONNACK OK (sessionPresent=${ack.sessionPresent})`);
            setStatus(s, 'connected');
            answer({ ok: true });
          });
          setTimeout(() => { if (!answered) { push('timeout'); answer({ ok: false, error: 'connection timeout' }); drop(b.sid); } }, timeout + 500);
        } catch (e) {
          push('ERROR ' + e.message);
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
        res.write(`event: status\ndata: ${JSON.stringify({ status: s.status })}\n\n`);
        req.on('close', () => {
          s.listeners.delete(res);
          if (!s.listeners.size) s.timer = setTimeout(() => drop(req.params.sid), GRACE_MS);
        });
      });

      const act = (fn) => async (req, res) => {
        const s = need(req, res); if (!s) return;
        try { res.json({ ok: true, ...(await fn(s, req.body ?? {})) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
      };
      router.post('/session/:sid/subscribe', act(async (s, b) => {
        if (!b.topic) throw new Error('topic is required');
        return { granted: await s.client.subscribeAsync(b.topic, { qos: Number(b.qos) || 0 }) };
      }));
      router.post('/session/:sid/unsubscribe', act(async (s, b) => {
        if (!b.topic) throw new Error('topic is required');
        await s.client.unsubscribeAsync(b.topic);
      }));
      router.post('/session/:sid/publish', act(async (s, b) => {
        if (!b.topic) throw new Error('topic is required');
        await s.client.publishAsync(b.topic, String(b.payload ?? ''), { qos: Number(b.qos) || 0, retain: !!b.retain });
      }));
      router.post('/session/:sid/disconnect', (req, res) => { drop(req.params.sid); res.json({ ok: true }); });
      // Client mode: test connecting to a 3rd-party broker over tcp/ws/mqtts/wss
      router.post('/client/test', async (req, res) => {
        const b = req.body ?? {};
        const started = Date.now();
        const log = [];
        const push = (l) => log.push(`+${Date.now() - started}ms ${l}`);
        let client;
        const finish = (payload) => {
          client?.end(true);
          res.json({ ms: Date.now() - started, log, ...payload });
        };
        try {
          if (!b.host) throw new Error('host is required');
          const protocol = b.protocol || 'mqtt'; // mqtt | mqtts | ws | wss
          const p = Number(b.port) || ({ mqtt: 1883, mqtts: 8883, ws: 80, wss: 443 })[protocol];
          const wsPath = protocol.startsWith('ws') ? (b.path || '/mqtt').replace(/^(?!\/)/, '/') : '';
          const url = `${protocol}://${b.host}:${p}${wsPath}`;
          const timeout = Math.min(Number(b.timeout) || 10, 60) * 1000;
          push(`connecting ${url}`);
          client = mqttLib.connect(url, {
            clientId: b.clientId || `tester-${Math.random().toString(16).slice(2, 8)}`,
            username: b.user || undefined,
            password: b.pass || undefined,
            rejectUnauthorized: b.rejectUnauthorized !== false,
            protocolVersion: Number(b.version) || 4,
            connectTimeout: timeout,
            reconnectPeriod: 0,
            clean: true,
          });
          client.on('error', (e) => { push('ERROR ' + e.message); finish({ ok: false, error: e.message || String(e.code || e) }); });
          client.on('close', () => push('connection closed'));
          client.on('connect', (ack) => {
            push(`CONNACK OK (sessionPresent=${ack.sessionPresent})`);
            (async () => {
              const received = [];
              if (b.subTopic) {
                client.on('message', (t, m) => { received.push({ topic: t, payload: asText(m) }); push(`RECV ${t}: ${asText(m)}`); });
                const g = await client.subscribeAsync(b.subTopic, { qos: Number(b.qos) || 0 });
                push(`SUBACK ${JSON.stringify(g)}`);
              }
              if (b.pubTopic) {
                await client.publishAsync(b.pubTopic, String(b.payload ?? ''), { qos: Number(b.qos) || 0, retain: !!b.retain });
                push(`PUBLISHED to ${b.pubTopic}`);
              }
              if (b.subTopic && b.listenSeconds) await new Promise((r) => setTimeout(r, Math.min(Number(b.listenSeconds), 30) * 1000));
              finish({ ok: true, received });
            })().catch((e) => { push('ERROR ' + e.message); finish({ ok: false, error: e.message }); });
          });
          setTimeout(() => { if (!res.headersSent && !client.connected) { push('timeout'); finish({ ok: false, error: 'connection timeout' }); } }, timeout + 500);
        } catch (e) {
          push('ERROR ' + e.message);
          finish({ ok: false, error: e.message });
        }
      });
    },
  };
}
