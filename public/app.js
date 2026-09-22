import { workspace } from './workspace.js';
import { smtpType } from './views/smtp.js';
import { mqttType } from './views/mqtt.js';
import { httpType } from './views/http.js';
import { redisType } from './views/redis.js';
import { postgresType, mysqlType } from './views/sql.js';
import { imapType, pop3Type } from './views/mail-in.js';
import { tcpType, dnsType, tlsType } from './views/net-tools.js';
import { sftpType, ftpType, s3Type } from './views/files.js';
import { ldapType } from './views/ldap.js';
import { amqpType, kafkaType } from './views/queues.js';
import { websocketType, syslogType, snmpType } from './views/messaging.js';

// Register new tab types here (id must match the backend service id).
// `group` decides where each type sits in the "+" menu; groups are shown in the order they first appear below.
const types = [
  { ...httpType, group: 'Web' },
  { ...websocketType, group: 'Web' },
  { ...smtpType, group: 'Mail' },
  { ...imapType, group: 'Mail' },
  { ...pop3Type, group: 'Mail' },
  { ...mqttType, group: 'Messaging' },
  { ...amqpType, group: 'Messaging' },
  { ...kafkaType, group: 'Messaging' },
  { ...syslogType, group: 'Messaging' },
  { ...redisType, group: 'Databases' },
  { ...postgresType, group: 'Databases' },
  { ...mysqlType, group: 'Databases' },
  { ...sftpType, group: 'Files & storage' },
  { ...ftpType, group: 'Files & storage' },
  { ...s3Type, group: 'Files & storage' },
  { ...tcpType, group: 'Network' },
  { ...dnsType, group: 'Network' },
  { ...tlsType, group: 'Network' },
  { ...snmpType, group: 'Network' },
  { ...ldapType, group: 'Directory' },
];

const api = (path, opts = {}) =>
  fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts })
    .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText); return r.status === 204 ? null : r.json(); });

workspace({ root: document.getElementById('panel'), api, types });

// Theme: light | dark | system (no data-theme = follow OS)
const themeBox = document.getElementById('theme');
const applyTheme = (t) => {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  [...themeBox.children].forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  try { localStorage.setItem('theme', t); } catch {}
};
themeBox.onclick = (e) => e.target.dataset.t && applyTheme(e.target.dataset.t);
applyTheme((() => { try { return localStorage.getItem('theme') || 'system'; } catch { return 'system'; } })());
