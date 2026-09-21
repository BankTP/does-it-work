import pg from 'pg';
import mysql from 'mysql2/promise';
import { clientTest, hostOf, portOf, timeoutMs, tlsSummary, withTimeout } from './util.js';

const ROW_LIMIT = 20;
const query = (b) => String(b.query || '').trim() || 'SELECT 1';
const preview = (rows) => JSON.stringify(rows.slice(0, ROW_LIMIT)) + (rows.length > ROW_LIMIT ? ` … (${rows.length} rows)` : '');
const tlsOf = (b) => (b.ssl === 'require' ? { rejectUnauthorized: false } : b.ssl === 'verify' ? { rejectUnauthorized: true } : undefined);

// Service contract: { id, name, routes(router) }
export function createPostgresService() {
  return {
    id: 'postgres',
    name: 'PostgreSQL',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        const port = portOf(b, 5432);
        const timeout = timeoutMs(b);
        const client = new pg.Client({
          host, port,
          user: b.user || undefined,
          password: b.pass || undefined,
          database: b.database || undefined,
          ssl: tlsOf(b) ?? false,
          connectionTimeoutMillis: timeout,
          query_timeout: timeout,
        });
        client.on('error', () => {});
        try {
          push(`connecting ${host}:${port}${b.database ? `/${b.database}` : ''} (ssl: ${b.ssl || 'disable'})`);
          await withTimeout(client.connect(), timeout + 500, 'connect');
          push(`connected, authenticated as ${b.user || '(default user)'}`);
          const stream = client.connection?.stream;
          if (stream?.encrypted) push(tlsSummary(stream));
          const sql = query(b);
          push(`> ${sql}`);
          const r = await client.query(sql);
          push(`< ${r.command} ${r.rowCount ?? 0} row(s)${r.rows?.length ? ': ' + preview(r.rows) : ''}`);
          const version = (await client.query('SHOW server_version')).rows[0]?.server_version;
          push(`server version ${version}`);
          return { response: `PostgreSQL ${version}`, rows: r.rows?.slice(0, ROW_LIMIT) };
        } finally {
          client.end().catch(() => {});
        }
      }));
    },
  };
}

export function createMysqlService() {
  return {
    id: 'mysql',
    name: 'MySQL',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        const port = portOf(b, 3306);
        const timeout = timeoutMs(b);
        push(`connecting ${host}:${port}${b.database ? `/${b.database}` : ''} (ssl: ${b.ssl || 'disable'})`);
        const conn = await withTimeout(mysql.createConnection({
          host, port,
          user: b.user || undefined,
          password: b.pass || undefined,
          database: b.database || undefined,
          ssl: tlsOf(b),
          connectTimeout: timeout,
        }), timeout + 500, 'connect');
        try {
          push(`connected, authenticated as ${b.user || '(default user)'}`);
          const stream = conn.connection?.stream;
          if (stream?.encrypted) push(tlsSummary(stream));
          const sql = query(b);
          push(`> ${sql}`);
          const [rows] = await withTimeout(conn.query(sql), timeout, 'query');
          push(Array.isArray(rows) ? `< ${rows.length} row(s): ${preview(rows)}` : `< OK, ${rows.affectedRows ?? 0} row(s) affected`);
          const version = (await conn.query('SELECT VERSION() AS v'))[0][0]?.v;
          push(`server version ${version}`);
          return { response: `MySQL ${version}`, rows: Array.isArray(rows) ? rows.slice(0, ROW_LIMIT) : undefined };
        } finally {
          conn.destroy();
        }
      }));
    },
  };
}
