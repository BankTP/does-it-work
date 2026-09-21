import Redis from 'ioredis';
import { clientTest, hostOf, portOf, splitArgs, timeoutMs, withTimeout } from './util.js';

const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v, (_k, x) => (Buffer.isBuffer(x) ? x.toString() : x)));

// Service contract: { id, name, routes(router) }
export function createRedisService() {
  return {
    id: 'redis',
    name: 'Redis',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        const port = portOf(b, 6379);
        const timeout = timeoutMs(b);
        const db = Number(b.db) || 0;
        const command = splitArgs(b.command ?? '');
        const client = new Redis({
          host, port, db,
          username: b.user || undefined,
          password: b.pass || undefined,
          tls: b.tls ? { rejectUnauthorized: b.rejectUnauthorized !== false, servername: host } : undefined,
          lazyConnect: true,
          connectTimeout: timeout,
          commandTimeout: timeout,
          retryStrategy: () => null,
          maxRetriesPerRequest: 0,
          enableOfflineQueue: false,
        });
        let lastError;
        client.on('error', (e) => { lastError = e; });
        try {
          push(`connecting ${host}:${port}${b.tls ? ' (TLS)' : ''}`);
          await withTimeout(client.connect(), timeout + 500, 'connect').catch((e) => { throw lastError ?? e; });
          push('connected' + (b.pass ? `, AUTH sent${b.user ? ` as ${b.user}` : ''}` : ''));
          push(`> PING`);
          push(`< ${await client.ping()}`);
          if (db) push(`SELECT ${db} OK`);
          let version;
          try {
            version = (await client.info('server')).match(/redis_version:(\S+)/)?.[1];
            if (version) push(`server version ${version}`);
          } catch (e) { push(`INFO not permitted: ${e.message}`); }
          let reply;
          if (command.length) {
            push(`> ${command[0].toUpperCase()} ${command.slice(1).join(' ')}`.trim());
            reply = await client.call(command[0], ...command.slice(1));
            push(`< ${show(reply)}`);
          }
          return { response: `PONG${version ? ` · Redis ${version}` : ''}`, reply };
        } finally {
          client.disconnect();
        }
      }));
    },
  };
}
