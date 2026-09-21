import { esc } from '../workspace.js';

// UI definition for the MQTT tab type
export const mqttType = {
  id: 'mqtt',
  name: 'MQTT',
  color: '#9333ea',
  title: 'MQTT client',
  live: true, // Connect/Disconnect button + persistent session
  fields: `
    <label>Protocol</label>
    <select name="protocol"><option value="mqtt">mqtt:// (TCP 1883)</option><option value="mqtts">mqtts:// (TLS 8883)</option><option value="ws">ws:// (WebSocket)</option><option value="wss">wss:// (WebSocket + TLS)</option></select>
    <div class="row"><div><label>Host</label><input name="host" placeholder="broker.example.com" required></div>
      <div><label>Port (blank = default)</label><input name="port"></div></div>
    <label>WebSocket path (ws/wss)</label><input name="path" value="/mqtt">
    <div class="row2"><div><label>Username</label><input name="user" autocomplete="off"></div>
      <div><label>Password</label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>
    <div class="row2"><div><label>Client ID (optional)</label><input name="clientId"></div>
      <div><label>MQTT version</label><select name="version"><option value="4">3.1.1</option><option value="5">5.0</option><option value="3">3.1</option></select></div></div>
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`,
  // Right-hand column: shown next to the connection form, enabled once connected
  side: `
    <fieldset class="box"><legend>Subscribe</legend>
      <div class="row"><div><label>Topic</label><input name="subTopic" placeholder="test/#"></div>
        <div><label>QoS</label><select name="subQos"><option>0</option><option>1</option><option>2</option></select></div></div>
      <div class="subs" data-role="subs"></div>
      <div class="bar"><button type="button" class="b primary" data-act="subscribe" data-live disabled>Subscribe</button>
        <button type="button" class="b" data-act="unsubscribe" data-live disabled>Unsubscribe</button>
        <span class="grow"></span><button type="button" class="b" data-act="clear">Clear</button></div>
      <div class="msgs" data-role="recv"><div class="muted">Connect, then subscribe to see messages here.</div></div>
    </fieldset>
    <fieldset class="box"><legend>Publish</legend>
      <div class="row"><div><label>Topic</label><input name="pubTopic"></div>
        <div><label>QoS</label><select name="pubQos"><option>0</option><option>1</option><option>2</option></select></div></div>
      <label>Message</label><textarea name="payload" rows="3">hello</textarea>
      <div class="bar" style="margin-top:8px"><button type="button" class="b primary" data-act="publish" data-live disabled>Publish</button>
        <label class="chk" style="margin:0"><input type="checkbox" name="retain"> Retain</label></div>
    </fieldset>`,
  actions: {
    subscribe: (d) => ({ path: 'subscribe', body: { topic: d.subTopic, qos: d.subQos }, note: `subscribed ${d.subTopic} (QoS ${d.subQos})` }),
    unsubscribe: (d) => ({ path: 'unsubscribe', body: { topic: d.subTopic }, note: `unsubscribed ${d.subTopic}` }),
    publish: (d) => ({ path: 'publish', body: { topic: d.pubTopic, payload: d.payload, qos: d.pubQos, retain: d.retain }, note: `published to ${d.pubTopic}` }),
  },
  // Feed for the subscribe box: incoming messages plus notes about actions
  onEvent(el, kind, data) {
    const subs = (el.__subs ??= new Map()); // topic -> qos, cleared whenever the connection drops
    if (['subscribe', 'unsubscribe', 'status'].includes(kind)) {
      if (kind === 'subscribe') subs.set(data.topic, data.qos);
      else if (kind === 'unsubscribe') subs.delete(data.topic);
      else if (data.status !== 'connected') subs.clear();
      el.querySelector('[data-role=subs]').innerHTML = subs.size
        ? [...subs].map(([t, q]) => `<span class="sub"><span class="dot connected"></span>${esc(t)} <small class="muted">QoS ${esc(q)}</small><button type="button" class="x" data-act="unsubscribe" data-topic="${esc(t)}" title="Unsubscribe">×</button></span>`).join('')
        : '<span class="muted">○ Not subscribed</span>';
      return;
    }
    const box = el.querySelector('[data-role=recv]');
    if (kind === 'clear') { box.innerHTML = ''; return; }
    box.querySelector('.muted:only-child')?.remove();
    const time = new Date(data.ts ?? Date.now()).toLocaleTimeString();
    box.insertAdjacentHTML('afterbegin', kind === 'message'
      ? `<div class="msg"><b>${esc(data.topic)}</b> <small class="muted">${time} · QoS ${data.qos}${data.retain ? ' · retained' : ''}</small><pre>${esc(data.payload)}</pre></div>`
      : `<div class="msg"><small style="color:var(--${data.bad ? 'bad' : 'muted'})">${time} · ${esc(data.text)}</small></div>`);
  },
};
