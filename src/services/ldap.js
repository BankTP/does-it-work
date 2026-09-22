import { Client } from 'ldapts';
import { clientTest, hostOf, portOf, timeoutMs, withTimeout } from './util.js';

const SCOPES = ['base', 'one', 'sub'];

// Service contract: { id, name, routes(router) }
export function createLdapService() {
  return {
    id: 'ldap',
    name: 'LDAP',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        const secure = b.protocol === 'ldaps';
        const port = portOf(b, secure ? 636 : 389);
        const timeout = timeoutMs(b);
        const scope = b.scope || 'sub';
        if (!SCOPES.includes(scope)) throw new Error('scope must be base, one or sub');
        const tlsOptions = { rejectUnauthorized: b.rejectUnauthorized !== false };
        const client = new Client({ url: `${secure ? 'ldaps' : 'ldap'}://${host.includes(':') ? `[${host}]` : host}:${port}`, timeout, connectTimeout: timeout, tlsOptions });
        try {
          push(`connecting ${host}:${port} (${secure ? 'LDAPS' : b.starttls ? 'STARTTLS' : 'plain'})`);
          if (b.starttls && !secure) { await withTimeout(client.startTLS(tlsOptions), timeout, 'STARTTLS'); push('STARTTLS OK'); }
          if (b.user) {
            await withTimeout(client.bind(b.user, b.pass ?? ''), timeout, 'bind');
            push(`BIND OK as ${b.user}`);
          } else {
            await withTimeout(client.bind('', ''), timeout, 'bind');
            push('anonymous BIND OK');
          }
          if (!b.baseDN) return { response: 'bind OK' };
          const filter = String(b.filter || '').trim() || '(objectClass=*)';
          push(`SEARCH base="${b.baseDN}" scope=${scope} filter=${filter}`);
          const { searchEntries } = await withTimeout(client.search(b.baseDN, { scope, filter, sizeLimit: 10, timeLimit: Math.ceil(timeout / 1000), attributes: ['dn', 'cn', 'uid', 'mail'] }), timeout, 'search');
          push(`${searchEntries.length} entr${searchEntries.length === 1 ? 'y' : 'ies'}${searchEntries.length === 10 ? ' (limited to 10)' : ''}`);
          for (const e of searchEntries) push(`  ${e.dn}${e.mail ? ` <${[e.mail].flat()[0]}>` : ''}`);
          return { response: `bind OK · ${searchEntries.length} entr${searchEntries.length === 1 ? 'y' : 'ies'}` };
        } finally {
          client.unbind().catch(() => {});
        }
      }));
    },
  };
}
