export const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const readForm = (f) => {
  const d = {};
  for (const el of f.elements) if (el.name) d[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  return d;
};
const fillForm = (f, vals = {}) => {
  for (const [k, v] of Object.entries(vals)) {
    const el = f.elements[k];
    if (el && !k.startsWith('__')) el.type === 'checkbox' ? (el.checked = !!v) : (el.value = v);
  }
};
const resultHtml = (r) => `<p><b style="color:var(--${r.ok ? 'ok' : 'bad'})">${r.ok ? 'OK' : 'FAILED'}</b> · ${r.ms}ms ${esc(r.error || r.response || '')}</p>
  <pre class="log">${esc((r.log || []).join('\n'))}</pre>`;

// Form fields holding secrets: never persisted in drafts, encrypted when saved (must match SECRET_KEYS on the server)
const SECRETS = ['pass', 'password', 'privateKey', 'passphrase'];
const SECRET_INPUTS = 'input[type=password],textarea[data-secret]';
const SAVE_PASS_TOKEN = '<!--save-pass-->';
const SAVE_PASS = '<label class="chk"><input type="checkbox" name="__savePass"> Save password with this config (stored encrypted)</label>';
const PW_PLACEHOLDER = '•••••••• password saved — leave blank to keep';

// Single workspace: universal tabs (each tagged with its type), saved tree with folders, history.
export function workspace({ root, api, types }) {
  const TABS_KEY = 'tabs';
  const typeOf = (id) => types.find((t) => t.id === id) ?? { id, name: id.toUpperCase(), color: '#6b7686' };
  const tag = (id) => { const t = typeOf(id); return `<span class="tag" style="--c:${t.color}">${esc(t.name)}</span>`; };

  const tabs = []; // { uid, service, configId, folderId, name, dirty, running, el, form }
  let active = null;
  let uid = 0;
  let configs = [];
  let folders = [];
  const collapsed = new Set();

  root.innerHTML = `<div class="ws">
    <aside class="card side"><div class="bar"><b class="grow">Saved</b><button class="b" id="newfolder" title="New folder">+ Folder</button></div><div id="saved"></div></aside>
    <div class="main">
      <div class="etabs" id="etabs"></div>
      <div id="empty" class="card empty" hidden>No open tabs. Click <b>+</b> to add one.</div>
      <div id="editors"></div>
    </div>
    <aside class="card side"><div class="bar"><b class="grow">History</b><button class="b" id="clr">Clear</button></div><div id="hist"></div></aside>
    <dialog id="hdlg"><div id="hdet"></div><div class="bar"><span class="grow"></span><button class="b" id="hclose">Close</button></div></dialog></div>`;
  const $ = (id) => root.querySelector('#' + id);

  // ---- persistence of open tabs (drafts; passwords excluded)
  const persist = () => {
    try {
      localStorage.setItem(TABS_KEY, JSON.stringify({
        active: active?.uid,
        tabs: tabs.map((t) => {
          const data = readForm(t.form);
          for (const k of ['__name', '__folder', '__savePass', ...SECRETS]) delete data[k];
          return { uid: t.uid, service: t.service, configId: t.configId, folderId: t.folderId, name: t.name, dirty: t.dirty, data };
        }),
      }));
    } catch {}
  };

  // ---- tab bar
  const menuGroups = (() => {
    const seen = [];
    for (const t of types) if (!seen.includes(t.group)) seen.push(t.group);
    return seen.map((g) => [g, types.filter((t) => t.group === g)]);
  })();
  const menuHtml = (filter = '') => {
    const q = filter.trim().toLowerCase();
    const match = (t) => !q || t.name.toLowerCase().includes(q) || t.group?.toLowerCase().includes(q);
    const groups = menuGroups.map(([g, list]) => [g, list.filter(match)]).filter(([, list]) => list.length);
    if (!groups.length) return '<p class="muted" style="margin:6px 8px">No matches</p>';
    return groups.map(([g, list]) => `<div class="mgroup">${esc(g)}</div>${list.map((t) => `<button data-add="${t.id}"><span class="mdot" style="--c:${t.color}"></span>${esc(t.name)}</button>`).join('')}`).join('');
  };
  const renderTabs = () => {
    $('etabs').innerHTML =
      `<div class="addwrap"><button class="b" id="plus" title="New tab">+</button><div class="menu" id="menu" hidden>
        ${types.length > 8 ? '<input class="mfilter" id="mfilter" placeholder="Filter…" autocomplete="off">' : ''}
        <div id="mlist">${menuHtml()}</div></div></div>` +
      tabs.map((t) => `<div class="etab ${t === active ? 'on' : ''}" data-uid="${t.uid}">
      ${tag(t.service)} ${typeOf(t.service).live ? `<span class="dot ${t.status}" title="${t.status}"></span> ` : ''}${t.running ? '<span class="spin">◌</span> ' : ''}<span class="ename">${esc(t.name)}</span>${t.dirty ? ' •' : ''}<button class="x" data-close="${t.uid}" title="Close">×</button></div>`).join('');
    for (const t of tabs) t.el.hidden = t !== active;
    $('empty').hidden = tabs.length > 0;
    persist();
  };

  const folderOptions = (selected) => {
    const out = ['<option value="">(no folder)</option>'];
    const walk = (parent, depth) => {
      for (const f of folders.filter((x) => (x.parent_id ?? null) === parent)) {
        out.push(`<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${'  '.repeat(depth)}📁 ${esc(f.name)}</option>`);
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out.join('');
  };
  const refreshFolderSelects = () => { for (const t of tabs) t.form.elements.__folder.innerHTML = folderOptions(t.folderId); };

  function openTab({ service, configId = null, folderId = null, name, data = {}, dirty = false, hasSecret = false }) {
    if (configId) {
      const ex = tabs.find((t) => t.configId === configId);
      if (ex) { active = ex; renderTabs(); return ex; }
    }
    const def = typeOf(service);
    const fields = def.fields ?? '';
    const fieldsHtml = fields.includes(SAVE_PASS_TOKEN) ? fields.replace(SAVE_PASS_TOKEN, SAVE_PASS) : fields + SAVE_PASS;
    const t = { uid: ++uid, service, configId, folderId, name: name || `Untitled ${uid}`, dirty, running: false, hasSavedPassword: hasSecret, status: 'disconnected', sid: null, es: null };
    t.el = document.createElement('div');
    const head = `<h2>${tag(service)} ${esc(def.title ?? def.name)}</h2>
      <div class="row3"><div><label>Config name</label><input name="__name" required></div>
        <div><label>Folder</label><select name="__folder"></select></div>
        <div style="align-self:end"><button type="button" class="b" data-act="save">Save</button></div></div>
      ${fieldsHtml}`;
    t.el.innerHTML = def.live
      ? `<form class="card form live"><div class="lcol">${head}
          <div class="bar"><button type="button" class="b primary" data-role="conn" data-act="connect">Connect</button>
            <span class="pill" data-role="status"><span class="dot disconnected"></span> Disconnected</span><span class="muted" data-role="msg"></span></div></div>
          <div class="rcol">${def.side ?? ''}</div></form>
        <div class="card form" data-role="res" hidden></div>`
      : `<form class="card form">${head}
      <div class="bar"><button class="b primary" data-act="run">Run test</button><span class="muted" data-role="msg"></span></div></form>
      <div class="card form" data-role="res" hidden></div>`;
    t.form = t.el.querySelector('form');
    fillForm(t.form, data);
    t.form.elements.__name.value = t.name;
    t.form.elements.__savePass.checked = hasSecret;
    setPwPlaceholder(t);
    t.form.elements.__folder.innerHTML = folderOptions(folderId);
    $('editors').append(t.el);
    if (def.live) setLive(t, 'disconnected');
    t.form.addEventListener('input', (e) => {
      if (e.target.name === '__name') t.name = e.target.value || 'Untitled';
      if (e.target.name === '__folder') t.folderId = e.target.value ? Number(e.target.value) : null;
      t.dirty = true; renderTabs();
    });
    t.form.onsubmit = (e) => e.preventDefault();
    t.el.onclick = (e) => {
      const { fillName, fillValue } = e.target.dataset; // quick-pick chips
      if (fillName) { const el = t.form.elements[fillName]; el.value = fillValue; el.dispatchEvent(new Event('input', { bubbles: true })); return; }
      const a = e.target.dataset.act; if (a === 'run') run(t);
      else if (a === 'save') save(t);
      else if (a === 'connect') connect(t);
      else if (a === 'disconnect') disconnect(t);
      else if (a === 'clear') def.onEvent?.(t.el, 'clear');
      else if (a && def.actions?.[a]) liveAct(t, a, e.target.dataset.topic); };
    tabs.push(t);
    active = t;
    renderTabs();
    return t;
  }

  const setPwPlaceholder = (t) => {
    for (const el of t.form.querySelectorAll(SECRET_INPUTS)) el.placeholder = t.hasSavedPassword ? PW_PLACEHOLDER : '';
  };

  const closeTab = (t) => {
    if (t.dirty && !confirm(`"${t.name}" has unsaved changes. Close anyway?`)) return;
    if (t.sid) disconnect(t);
    tabs.splice(tabs.indexOf(t), 1);
    t.el.remove();
    if (active === t) active = tabs[tabs.length - 1] ?? null;
    renderTabs();
  };

  // ---- run (each tab independent → can run concurrently)
  async function run(t) {
    if (!t.form.reportValidity()) return;
    const body = readForm(t.form);
    delete body.__name; delete body.__folder; delete body.__savePass;
    if (t.configId && t.hasSavedPassword) body.configId = t.configId; // server fills the saved password if left blank
    const res = t.el.querySelector('[data-role=res]');
    t.running = true; renderTabs();
    res.hidden = false; res.innerHTML = '<p class="muted">Running…</p>';
    try {
      const r = await api(`/services/${t.service}/client/test`, { method: 'POST', body: JSON.stringify(body) });
      res.innerHTML = resultHtml(r);
      typeOf(t.service).onResult?.(t.el, r);
      loadHistory();
    } catch (err) { res.textContent = err.message; }
    t.running = false; renderTabs();
  }

  // ---- live connections (types with `live: true`): connect once, then subscribe/publish over the session
  const LIVE_LABEL = { disconnected: 'Disconnected', connecting: 'Connecting…', connected: 'Connected', error: 'Error' };
  const setLive = (t, status, error) => {
    t.status = status;
    const st = t.el.querySelector('[data-role=status]');
    st.innerHTML = `<span class="dot ${status}"></span> ${LIVE_LABEL[status]}${error ? ' · ' + esc(error) : ''}`;
    const btn = t.el.querySelector('[data-role=conn]');
    const on = status === 'connected';
    btn.textContent = on ? 'Disconnect' : status === 'connecting' ? 'Connecting…' : 'Connect';
    btn.dataset.act = on ? 'disconnect' : 'connect';
    btn.disabled = status === 'connecting';
    for (const el of t.el.querySelectorAll('[data-live]')) el.disabled = !on;
    typeOf(t.service).onEvent?.(t.el, 'status', { status });
    renderTabs();
  };
  const sessionUrl = (t, path) => `/services/${t.service}/session/${t.sid}/${path}`;
  const closeEvents = (t) => { t.es?.close(); t.es = null; };

  async function connect(t) {
    if (!t.form.reportValidity()) return;
    const body = readForm(t.form);
    delete body.__name; delete body.__folder; delete body.__savePass;
    if (t.configId && t.hasSavedPassword) body.configId = t.configId;
    t.sid = Math.random().toString(36).slice(2);
    body.sid = t.sid;
    const res = t.el.querySelector('[data-role=res]');
    setLive(t, 'connecting');
    res.hidden = false; res.innerHTML = '<p class="muted">Connecting…</p>';
    try {
      const r = await api(`/services/${t.service}/session/connect`, { method: 'POST', body: JSON.stringify(body) });
      res.innerHTML = resultHtml(r);
      loadHistory();
      if (!r.ok) { t.sid = null; return setLive(t, 'error', r.error); }
      const def = typeOf(t.service);
      t.es = new EventSource(`/api${sessionUrl(t, 'events')}`);
      t.es.addEventListener('status', (e) => {
        const d = JSON.parse(e.data);
        setLive(t, d.status, d.error);
        if (d.status !== 'connected') { closeEvents(t); t.sid = null; }
      });
      t.es.addEventListener('message', (e) => def.onEvent?.(t.el, 'message', JSON.parse(e.data)));
      t.es.onerror = () => { if (t.es?.readyState === EventSource.CLOSED) { closeEvents(t); t.sid = null; setLive(t, 'disconnected'); } };
      setLive(t, 'connected');
    } catch (err) { t.sid = null; res.textContent = err.message; setLive(t, 'error', err.message); }
  }

  async function disconnect(t) {
    const sid = t.sid;
    closeEvents(t); t.sid = null;
    if (sid) await api(`/services/${t.service}/session/${sid}/disconnect`, { method: 'POST', body: '{}' }).catch(() => {});
    if (t.el.isConnected) setLive(t, 'disconnected');
  }

  async function liveAct(t, name, topic) {
    const def = typeOf(t.service);
    const form = readForm(t.form);
    if (topic) form.subTopic = topic; // e.g. the × on a subscription chip
    const { path, body, note } = def.actions[name](form);
    try {
      await api(sessionUrl(t, path), { method: 'POST', body: JSON.stringify(body) });
      def.onEvent?.(t.el, 'note', { text: note });
      def.onEvent?.(t.el, name, body);
    } catch (err) { def.onEvent?.(t.el, 'note', { text: err.message, bad: true }); }
  }

  // ---- save
  async function save(t) {
    if (!t.form.reportValidity()) return;
    const d = readForm(t.form);
    const name = d.__name.trim();
    const keepPass = d.__savePass;
    delete d.__name; delete d.__folder; delete d.__savePass;
    for (const k of SECRETS) if (!d[k] || !keepPass) delete d[k];
    const typed = SECRETS.some((k) => d[k]);
    const payload = JSON.stringify({ name, data: d, folder_id: t.folderId, keep_secrets: keepPass && !typed && t.hasSavedPassword });
    const msg = t.el.querySelector('[data-role=msg]');
    try {
      if (t.configId) await api(`/configs/${t.configId}`, { method: 'PUT', body: payload });
      else t.configId = (await api(`/services/${t.service}/configs`, { method: 'POST', body: payload })).id;
      t.name = name; t.dirty = false;
      t.hasSavedPassword = !!keepPass && (typed || t.hasSavedPassword);
      if (t.hasSavedPassword) for (const el of t.form.querySelectorAll(SECRET_INPUTS)) el.value = ''; // now stored; show the placeholder instead
      setPwPlaceholder(t);
      msg.textContent = 'Saved';
      setTimeout(() => (msg.textContent = ''), 2000);
      await loadTree(); renderTabs();
    } catch (err) { msg.textContent = err.message; }
  }

  // ---- saved tree (folders + configs, drag & drop to move)
  async function loadTree() {
    [configs, folders] = await Promise.all([api('/configs').catch(() => []), api('/folders').catch(() => [])]);
    const branch = (parent, depth) => {
      const pad = `style="padding-left:${8 + depth * 14}px"`;
      let h = '';
      for (const f of folders.filter((x) => (x.parent_id ?? null) === parent)) {
        const closed = collapsed.has(f.id);
        h += `<div class="frow" data-folder="${f.id}" ${pad}><span class="tog" data-toggle="${f.id}">${closed ? '▸' : '▾'}</span> 📁 <b class="grow">${esc(f.name)}</b>
          <span class="acts"><button class="x" data-fadd="${f.id}" title="New subfolder">＋</button><button class="x" data-fren="${f.id}" title="Rename">✎</button><button class="x" data-fdel="${f.id}" title="Delete folder">🗑</button></span></div>`;
        if (!closed) h += branch(f.id, depth + 1);
      }
      for (const c of configs.filter((x) => (x.folder_id ?? null) === parent)) {
        h += `<div class="item" draggable="true" data-cfg="${c.id}" ${pad}>${tag(c.service)} <b>${esc(c.name)}</b>
          <button class="x" data-delcfg="${c.id}" title="Delete">🗑</button></div>`;
      }
      return h;
    };
    $('saved').innerHTML = (branch(null, 0) || '<p class="muted pad">Nothing saved yet.</p>') + '<div class="droproot" data-folder="">Drop here for top level</div>';
    refreshFolderSelects();
  }

  const promptName = (msg, def = '') => (prompt(msg, def) || '').trim();
  $('newfolder').onclick = async () => {
    const name = promptName('Folder name'); if (!name) return;
    await api('/folders', { method: 'POST', body: JSON.stringify({ name }) }); loadTree();
  };
  $('saved').onclick = async (e) => {
    const d = e.target.dataset;
    if (d.toggle) { const id = Number(d.toggle); collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); return loadTree(); }
    if (d.fadd) {
      const name = promptName('Subfolder name'); if (!name) return;
      await api('/folders', { method: 'POST', body: JSON.stringify({ name, parent_id: Number(d.fadd) }) }); return loadTree();
    }
    if (d.fren) {
      const f = folders.find((x) => x.id == d.fren);
      const name = promptName('Rename folder', f.name); if (!name) return;
      await api(`/folders/${f.id}`, { method: 'PUT', body: JSON.stringify({ name }) }); return loadTree();
    }
    if (d.fdel) {
      if (!confirm('Delete this folder? Its contents move up one level.')) return;
      await api(`/folders/${d.fdel}`, { method: 'DELETE' });
      for (const t of tabs) if (t.folderId == d.fdel) t.folderId = null;
      return loadTree();
    }
    if (d.delcfg) {
      if (!confirm('Delete this saved config?')) return;
      await api(`/configs/${d.delcfg}`, { method: 'DELETE' });
      for (const t of tabs) if (t.configId == d.delcfg) { t.configId = null; t.dirty = true; t.hasSavedPassword = false; setPwPlaceholder(t); }
      await loadTree(); return renderTabs();
    }
    const it = e.target.closest('[data-cfg]');
    if (it) {
      const c = await api(`/configs/${it.dataset.cfg}`);
      openTab({ service: c.service, configId: c.id, folderId: c.folder_id, name: c.name, data: c.data, hasSecret: c.has_secret });
    }
  };
  $('saved').ondragstart = (e) => { const it = e.target.closest('[data-cfg]'); if (it) e.dataTransfer.setData('text/plain', it.dataset.cfg); };
  $('saved').ondragover = (e) => { if (e.target.closest('[data-folder]')) e.preventDefault(); };
  $('saved').ondrop = async (e) => {
    const target = e.target.closest('[data-folder]'); if (!target) return;
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain'); if (!id) return;
    const folderId = target.dataset.folder ? Number(target.dataset.folder) : null;
    await api(`/configs/${id}/move`, { method: 'PUT', body: JSON.stringify({ folder_id: folderId }) });
    for (const t of tabs) if (t.configId == id) t.folderId = folderId;
    loadTree();
  };

  $('etabs').onclick = (e) => {
    if (e.target.closest('#plus')) {
      const m = $('menu');
      m.hidden = !m.hidden;
      if (!m.hidden) { const f = $('mfilter'); if (f) { f.value = ''; $('mlist').innerHTML = menuHtml(); f.focus(); } }
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) { $('menu').hidden = true; return openTab({ service: add.dataset.add }); }
    const close = e.target.dataset.close;
    if (close) return closeTab(tabs.find((t) => t.uid == close));
    const tab = e.target.closest('.etab');
    if (tab) { active = tabs.find((t) => t.uid == tab.dataset.uid); renderTabs(); }
  };
  $('etabs').oninput = (e) => { if (e.target.id === 'mfilter') $('mlist').innerHTML = menuHtml(e.target.value); };
  document.addEventListener('click', (e) => { if (!e.target.closest('.addwrap')) { const m = $('menu'); if (m) m.hidden = true; } });

  // ---- history (all types)
  async function loadHistory() {
    const rows = await api('/history').catch(() => []);
    $('hist').innerHTML = rows.length ? rows.map((r) => `<div class="item" data-id="${r.id}">
      <b><span style="color:var(--${r.ok ? 'ok' : 'bad'})">●</span> ${tag(r.service)} ${esc(r.target)}</b>
      <small>${new Date(r.created_at).toLocaleString()} · ${r.ms}ms</small></div>`).join('') : '<p class="muted pad">No history yet.</p>';
  }
  $('hist').onclick = async (e) => {
    const it = e.target.closest('.item'); if (!it) return;
    const r = await api(`/history/${it.dataset.id}`);
    $('hdlg').showModal();
    $('hdet').innerHTML = `<div class="bar">${tag(r.service)} <b>${esc(r.target)}</b><span class="grow"></span>
      <button class="b" data-h="open">Open in new tab</button><button class="b" data-h="del">Delete</button></div>${resultHtml(r.result)}`;
    $('hdet').onclick = async (ev) => {
      if (ev.target.dataset.h === 'open') { $('hdlg').close(); openTab({ service: r.service, name: r.target, data: r.request, dirty: true }); }
      if (ev.target.dataset.h === 'del') { await api(`/history/${r.id}`, { method: 'DELETE' }); $('hdet').innerHTML = ''; $('hdlg').close(); loadHistory(); }
    };
  };
  $('hclose').onclick = () => $('hdlg').close();
  $('clr').onclick = async () => {
    if (!confirm('Delete all history?')) return;
    await api('/history', { method: 'DELETE' }); $('hdet').innerHTML = ''; loadHistory();
  };

  // ---- init: restore open tabs
  (async () => {
    await loadTree();
    let st = {};
    try { st = JSON.parse(localStorage.getItem(TABS_KEY) || '{}'); } catch {}
    const ids = new Set(configs.map((c) => c.id));
    const secretIds = new Set(configs.filter((c) => c.has_secret).map((c) => c.id));
    for (const s of st.tabs ?? []) {
      if (!types.some((t) => t.id === s.service)) continue;
      openTab({ service: s.service, configId: ids.has(s.configId) ? s.configId : null, folderId: s.folderId, name: s.name, data: s.data, dirty: s.dirty, hasSecret: secretIds.has(s.configId) });
    }
    const idx = (st.tabs ?? []).filter((s) => types.some((t) => t.id === s.service)).findIndex((s) => s.uid === st.active);
    if (idx >= 0) active = tabs[idx];
    renderTabs();
    loadHistory();
  })();
}
