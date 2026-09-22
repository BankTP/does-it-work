import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import { clientTest, hostOf, portOf, timeoutMs } from './util.js';

const connectOnce = (host, port, timeout) => new Promise((resolve, reject) => {
  const started = performance.now();
  const s = net.connect({ host, port, timeout });
  s.once('connect', () => resolve({ socket: s, ms: performance.now() - started }));
  s.once('timeout', () => { s.destroy(); reject(new Error(`connection timed out after ${timeout / 1000}s`)); });
  s.once('error', reject);
});

// Service contract: { id, name, routes(router) }
export function createTcpService() {
  return {
    id: 'tcp',
    name: 'TCP',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        if (!b.port) throw new Error('port is required');
        const port = portOf(b);
        const timeout = timeoutMs(b, 5);
        const count = Math.min(Math.max(Number(b.count) || 3, 1), 10);
        const times = [];
        let banner = '';
        for (let i = 1; i <= count; i++) {
          const { socket, ms } = await connectOnce(host, port, timeout);
          if (i === 1) push(`connected to ${socket.remoteAddress}:${port}`);
          push(`attempt ${i}/${count}: ${ms.toFixed(1)}ms`);
          times.push(ms);
          if (i === 1 && b.banner) {
            banner = await new Promise((resolve) => {
              const t = setTimeout(() => resolve(''), 2000);
              socket.once('data', (d) => { clearTimeout(t); resolve(d.toString('latin1').trim().slice(0, 500)); });
            });
            push(banner ? `banner: ${banner}` : 'no banner within 2s');
          }
          socket.destroy();
        }
        const avg = times.reduce((a, c) => a + c, 0) / times.length;
        push(`latency min ${Math.min(...times).toFixed(1)}ms / avg ${avg.toFixed(1)}ms / max ${Math.max(...times).toFixed(1)}ms`);
        return { response: `port ${port} open · avg ${avg.toFixed(1)}ms`, banner };
      }));
    },
  };
}

const RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA', 'CAA', 'SRV', 'PTR'];
const flat = (recs) => recs.map((r) => (Array.isArray(r) ? r.join('') : typeof r === 'object' ? JSON.stringify(r) : String(r)));
const missing = (e) => ['ENODATA', 'ENOTFOUND'].includes(e.code);

export function createDnsService() {
  return {
    id: 'dns',
    name: 'DNS',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const name = String(b.name || '').trim().replace(/\.$/, '');
        if (!name) throw new Error('domain name is required');
        const types = String(b.types || 'A,MX,TXT').toUpperCase().split(/[\s,]+/).filter(Boolean);
        const bad = types.find((t) => !RECORD_TYPES.includes(t));
        if (bad) throw new Error(`unsupported record type "${bad}" (use ${RECORD_TYPES.join(', ')})`);
        const resolver = new dns.Resolver({ timeout: timeoutMs(b, 5), tries: 1 });
        if (b.server) {
          const servers = String(b.server).split(/[\s,]+/).filter(Boolean);
          if (servers.some((s) => !net.isIP(s.replace(/:\d+$/, '')) && !/^\[.*\](:\d+)?$/.test(s))) throw new Error('DNS server must be an IP address (optionally with :port)');
          resolver.setServers(servers);
        }
        push(`resolving ${name} using ${resolver.getServers().join(', ')}`);
        const query = async (n, type) => {
          try {
            const recs = flat(await resolver.resolve(n, type));
            push(`${type} ${n}: ${recs.length} record(s)`);
            for (const r of recs) push(`  ${r}`);
            return recs;
          } catch (e) {
            if (!missing(e)) throw new Error(`${type} lookup of ${n} failed: ${e.message}`);
            push(`${type} ${n}: none`);
            return [];
          }
        };
        const found = {};
        for (const t of types) found[t] = await query(name, t);
        const problems = [];
        if (b.mailAuth) {
          const txt = (await query(name, 'TXT')).filter((r) => /^v=spf1\b/i.test(r));
          push(txt.length ? `SPF OK: ${txt[0]}` : 'SPF MISSING'); if (!txt.length) problems.push('no SPF record');
          if (txt.length > 1) { push('SPF has multiple records (invalid)'); problems.push('multiple SPF records'); }
          const dmarc = (await query(`_dmarc.${name}`, 'TXT')).filter((r) => /^v=DMARC1\b/i.test(r));
          push(dmarc.length ? `DMARC OK: ${dmarc[0]}` : 'DMARC MISSING'); if (!dmarc.length) problems.push('no DMARC record');
          if (b.dkimSelector) {
            const sel = String(b.dkimSelector).trim();
            const dkim = (await query(`${sel}._domainkey.${name}`, 'TXT')).filter((r) => /\bp=/.test(r));
            push(dkim.length ? `DKIM OK (selector ${sel})` : `DKIM MISSING (selector ${sel})`); if (!dkim.length) problems.push(`no DKIM key for selector ${sel}`);
          }
        }
        if (problems.length) throw new Error(problems.join('; '));
        const total = Object.values(found).flat().length;
        if (!b.mailAuth && !total) throw new Error(`no ${types.join('/')} records for ${name}`);
        return { response: `${total} record(s)`, records: found };
      }));
    },
  };
}

const TLS_VERSIONS = ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];
const handshake = (opts, timeout) => new Promise((resolve, reject) => {
  const s = tls.connect({ ...opts, timeout }, () => resolve(s));
  s.once('timeout', () => { s.destroy(); reject(new Error(`timed out after ${timeout / 1000}s`)); });
  s.once('error', reject);
});
const days = (d) => Math.floor((new Date(d) - Date.now()) / 86400000);
const dn = (o) => o?.CN ?? o?.O ?? '?';
const nameOf = (c) => dn(c?.subject);

export function createTlsService() {
  return {
    id: 'tls',
    name: 'TLS cert',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        const port = portOf(b, 443);
        const timeout = timeoutMs(b);
        const sni = String(b.servername || '').trim() || (net.isIP(host) ? undefined : host);
        const warnDays = Number(b.warnDays) || 14;
        const base = { host, port, servername: sni, rejectUnauthorized: false };
        push(`connecting ${host}:${port}${sni ? ` (SNI ${sni})` : ''}`);
        const s = await handshake(base, timeout);
        const cert = s.getPeerCertificate(true);
        push(`negotiated ${s.getProtocol()} ${s.getCipher().name}`);
        push(`subject: ${nameOf(cert)}`);
        push(`issuer: ${dn(cert.issuer)}`);
        push(`SANs: ${cert.subjectaltname ?? '(none)'}`);
        push(`valid: ${cert.valid_from} -> ${cert.valid_to}`);
        const seen = new Set();
        const chain = [];
        for (let c = cert; c && !seen.has(c.fingerprint256); c = c.issuerCertificate) { seen.add(c.fingerprint256); chain.push(nameOf(c)); }
        push(`chain: ${chain.join(' -> ')}`);
        const problems = [];
        const left = days(cert.valid_to);
        push(left < 0 ? `EXPIRED ${-left} day(s) ago` : `expires in ${left} day(s)`);
        if (left < 0) problems.push(`certificate expired ${-left} day(s) ago`);
        else if (left < warnDays) problems.push(`certificate expires in ${left} day(s) (warning threshold ${warnDays})`);
        if (!s.authorized) { push(`NOT TRUSTED: ${s.authorizationError}`); problems.push(`not trusted: ${s.authorizationError}`); }
        const mismatch = sni && tls.checkServerIdentity(sni, cert);
        if (mismatch) { push(`HOSTNAME MISMATCH: ${mismatch.message}`); problems.push(mismatch.message); }
        s.destroy();
        if (b.protocols) {
          for (const v of TLS_VERSIONS) {
            try { (await handshake({ ...base, minVersion: v, maxVersion: v }, timeout)).destroy(); push(`${v}: supported`); }
            catch (e) { push(`${v}: not supported (${e.code ?? e.message})`); }
          }
        }
        if (problems.length) throw new Error(problems.join('; '));
        return { response: `${nameOf(cert)} · ${left} days left`, daysLeft: left };
      }));
    },
  };
}
