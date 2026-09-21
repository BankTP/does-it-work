import { workspace } from './workspace.js';
import { smtpType } from './views/smtp.js';
import { mqttType } from './views/mqtt.js';

// Register new tab types here (id must match the backend service id).
const types = [smtpType, mqttType];

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
