import net from 'node:net';
import tls from 'node:tls';
import { ImapFlow } from 'imapflow';
import { clientTest, hostOf, portOf, timeoutMs, tlsSummary, withTimeout } from './util.js';

const FOLDER_LIMIT = 50;
const rejectOf = (b) => b.rejectUnauthorized !== false;

// Service contract: { id, name, routes(router) }
export function createImapService() {
  return {
    id: 'imap',
    name: 'IMAP',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        const security = b.security || 'auto'; // auto | ssl | starttls | none
        const port = portOf(b, security === 'ssl' || (security === 'auto' && !b.port) ? 993 : 143);
        const timeout = timeoutMs(b);
        const secure = security === 'ssl' || (security === 'auto' && port === 993);
        if (!b.user) throw new Error('username is required');
        const client = new ImapFlow({
          host, port, secure,
          doSTARTTLS: secure ? undefined : security === 'none' ? false : security === 'starttls' ? true : undefined,
          auth: { user: b.user, pass: b.pass ?? '' },
          tls: { rejectUnauthorized: rejectOf(b) },
          logger: false,
          connectionTimeout: timeout,
          greetingTimeout: timeout,
          socketTimeout: timeout * 3,
        });
        client.on('error', () => {});
        try {
          push(`connecting ${host}:${port} (${secure ? 'implicit TLS' : security === 'none' ? 'plain' : 'STARTTLS if offered'})`);
          await withTimeout(client.connect(), timeout * 2, 'connect');
          if (client.secureConnection) push('connection is encrypted');
          push(`LOGIN OK as ${b.user}`);
          push(`capabilities: ${[...client.capabilities.keys()].join(' ')}`);
          const folders = await client.list();
          push(`LIST: ${folders.length} folder(s)`);
          for (const f of folders.slice(0, FOLDER_LIMIT)) push(`  ${f.path}${f.specialUse ? ` (${f.specialUse})` : ''}`);
          const boxName = b.mailbox || 'INBOX';
          const st = await client.status(boxName, { messages: true, unseen: true });
          push(`${boxName}: ${st.messages} message(s), ${st.unseen ?? '?'} unseen`);
          return { response: `${st.messages} message(s) in ${boxName}`, folders: folders.map((f) => f.path) };
        } finally {
          client.close();
        }
      }));
    },
  };
}

// Minimal POP3 client: replies are single "+OK ..." lines, or multi-line blocks ending in ".".
const pop3Session = (socket, timeout) => {
  let buf = '';
  let waiter = null;
  const onData = (d) => { buf += d.toString('latin1'); waiter?.(); };
  socket.on('data', onData);
  const fail = (e) => { waiter?.(e); };
  socket.on('error', fail);
  socket.on('close', () => fail(new Error('connection closed by server')));
  const take = (multi) => {
    const lines = buf.split('\r\n');
    if (lines.length < 2) return null;
    if (multi && lines[0].startsWith('+OK')) {
      const end = lines.indexOf('.');
      if (end < 0) return null;
      buf = lines.slice(end + 1).join('\r\n');
      return lines.slice(0, end);
    }
    buf = lines.slice(1).join('\r\n');
    return [lines[0]];
  };
  const read = (multi) => withTimeout(new Promise((resolve, reject) => {
    const check = (err) => {
      if (err) { waiter = null; return reject(err); }
      const got = take(multi);
      if (got) { waiter = null; resolve(got); } else waiter = check;
    };
    check();
  }), timeout, 'server reply');
  return { read, detach: () => { socket.off('data', onData); socket.off('error', fail); buf = ''; } };
};

export function createPop3Service() {
  return {
    id: 'pop3',
    name: 'POP3',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        const security = b.security || 'auto'; // auto | ssl | starttls | none
        const port = portOf(b, security === 'ssl' || security === 'auto' ? 995 : 110);
        const timeout = timeoutMs(b);
        const implicit = security === 'ssl' || (security === 'auto' && port === 995);
        if (!b.user) throw new Error('username is required');
        const tlsOpts = { host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: rejectOf(b) };
        let socket = await withTimeout(new Promise((resolve, reject) => {
          push(`connecting ${host}:${port} (${implicit ? 'implicit TLS' : security === 'starttls' ? 'STARTTLS' : 'plain'})`);
          const s = implicit ? tls.connect(tlsOpts, () => resolve(s)) : net.connect({ host, port }, () => resolve(s));
          s.once('error', reject);
        }), timeout, 'connect');
        socket.setTimeout(timeout * 3, () => socket.destroy(new Error('socket timeout')));
        if (implicit) push(tlsSummary(socket));
        let session = pop3Session(socket, timeout);
        const send = async (cmd, { multi = false, mask = false } = {}) => {
          push(`> ${mask ? cmd.split(' ')[0] + ' ********' : cmd}`);
          socket.write(cmd + '\r\n');
          const lines = await session.read(multi);
          push(`< ${lines[0]}`);
          if (!lines[0].startsWith('+OK')) throw new Error(`${cmd.split(' ')[0]} rejected: ${lines[0]}`);
          return lines;
        };
        try {
          const greeting = (await session.read(false))[0];
          push(`< ${greeting}`);
          if (!greeting.startsWith('+OK')) throw new Error(`server refused connection: ${greeting}`);
          let caps = [];
          try { caps = (await send('CAPA', { multi: true })).slice(1); if (caps.length) push(`capabilities: ${caps.join(' ')}`); } catch (e) { push('CAPA not supported'); }
          if (security === 'starttls') {
            await send('STLS');
            session.detach();
            socket = await withTimeout(new Promise((resolve, reject) => {
              const s = tls.connect({ ...tlsOpts, socket }, () => resolve(s));
              s.once('error', reject);
            }), timeout, 'TLS handshake');
            push(tlsSummary(socket));
            session = pop3Session(socket, timeout);
          }
          await send(`USER ${b.user}`);
          await send(`PASS ${b.pass ?? ''}`, { mask: true });
          push(`LOGIN OK as ${b.user}`);
          const [stat] = await send('STAT');
          const [, count, bytes] = stat.split(' ');
          push(`${count} message(s), ${bytes} bytes`);
          await send('QUIT').catch(() => {});
          return { response: `${count} message(s), ${bytes} bytes` };
        } finally {
          socket.destroy();
        }
      }));
    },
  };
}
