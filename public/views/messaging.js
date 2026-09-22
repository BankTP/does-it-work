import { esc } from '../workspace.js';

// UI definitions for the WebSocket, Syslog and SNMP tab types
export const websocketType = {
  id: 'websocket',
  name: 'WebSocket',
  color: '#db2777',
  title: 'WebSocket client',
  live: true, // Connect/Disconnect button + persistent session
  fields: `
    <label>URL</label><input name="url" placeholder="wss://echo.example.com/socket" required>
    <label>Headers <span class="muted">(one per line, Name: value)</span></label><textarea name="headers" rows="2"></textarea>
    <div class="row2"><div><label>Subprotocols <span class="muted">(optional)</span></label><input name="protocols"></div>
      <div><label>Bearer token <span class="muted">(optional)</span></label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`,
  // Right-hand column: shown next to the connection form, enabled once connected
  side: `
    <fieldset class="box"><legend>Send</legend>
      <label>Message</label><textarea name="message" rows="3" placeholder="hello"></textarea>
      <div class="bar" style="margin-top:8px"><button type="button" class="b primary" data-act="send" data-live disabled>Send</button>
        <button type="button" class="b" data-act="ping" data-live disabled>Ping</button>
        <span class="grow"></span><button type="button" class="b" data-act="clear">Clear</button></div>
    </fieldset>
    <fieldset class="box"><legend>Messages</legend>
      <div class="msgs" data-role="recv"><div class="muted">Connect, then send a message. Everything sent and received shows up here.</div></div>
    </fieldset>`,
  actions: {
    send: (d) => ({ path: 'send', body: { message: d.message }, note: '' }),
    ping: () => ({ path: 'ping', body: {}, note: 'ping sent' }),
  },
  // Feed: frames in both directions, plus notes about actions and the connection
  onEvent(el, kind, data) {
    const box = el.querySelector('[data-role=recv]');
    if (kind === 'clear') { box.innerHTML = ''; return; }
    if (['ping'].includes(kind)) return;
    if (kind === 'status') {
      if (data.status === 'connected') box.innerHTML = '';
      return;
    }
    if (kind === 'note' && !data.text) return;
    box.querySelector('.muted:only-child')?.remove();
    const time = new Date(data.ts ?? Date.now()).toLocaleTimeString();
    const line = (label, body, cls = '') => `<div class="msg"><small class="muted">${time} · ${label}</small>${body ? `<pre${cls}>${esc(body)}</pre>` : ''}</div>`;
    box.insertAdjacentHTML('afterbegin',
      kind === 'message' ? (data.dir === 'sys' ? line(esc(data.payload)) : line('← received', data.payload))
      : kind === 'send' ? line('→ sent', data.message)
      : `<div class="msg"><small style="color:var(--${data.bad ? 'bad' : 'muted'})">${time} · ${esc(data.text)}</small></div>`);
  },
};

const opts = (list) => list.map((x) => `<option>${x}</option>`).join('');
export const syslogType = {
  id: 'syslog', name: 'Syslog', color: '#0f766e', title: 'Send a syslog message',
  fields: `
    <div class="row"><div><label>Host</label><input name="host" placeholder="logs.example.com" required></div>
      <div><label>Port <span class="muted">(blank = 514 / 6514)</span></label><input name="port" inputmode="numeric" pattern="[0-9]*"></div></div>
    <div class="row2"><div><label>Transport</label><select name="protocol"><option value="udp">UDP</option><option value="tcp">TCP</option><option value="tls">TLS</option></select></div>
      <div><label>Format</label><select name="format"><option value="rfc5424">RFC 5424</option><option value="rfc3164">RFC 3164 (BSD)</option></select></div></div>
    <div class="row2"><div><label>Facility</label><select name="facility">${opts(['local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7', 'kern', 'user', 'mail', 'daemon', 'auth', 'syslog', 'lpr', 'news', 'uucp', 'cron', 'authpriv', 'ftp', 'ntp', 'audit', 'alert', 'clock'])}</select></div>
      <div><label>Severity</label><select name="severity">${opts(['info', 'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'debug'])}</select></div></div>
    <div class="row2"><div><label>App name</label><input name="appName" value="does-it-work"></div>
      <div><label>Message</label><input name="message" value="test message from does-it-work"></div></div>
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`,
};

export const snmpType = {
  id: 'snmp', name: 'SNMP', color: '#57534e', title: 'Test SNMP agent (v1 / v2c)',
  fields: `
    <div class="row"><div><label>Host</label><input name="host" placeholder="192.168.1.1" required></div>
      <div><label>Port</label><input name="port" inputmode="numeric" pattern="[0-9]*" placeholder="161"></div></div>
    <div class="row2"><div><label>Version</label><select name="version"><option value="2c">v2c</option><option value="1">v1</option></select></div>
      <div><label>Community</label><input name="pass" type="password" autocomplete="off" placeholder="public"><!--save-pass--></div></div>
    <label>OIDs <span class="muted">(space or comma separated, blank = sysDescr, sysUpTime, sysName)</span></label>
    <input name="oids" placeholder="1.3.6.1.2.1.1.1.0">`,
};
