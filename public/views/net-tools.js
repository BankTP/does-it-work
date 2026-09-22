// UI definitions for the TCP, DNS and TLS certificate tab types
export const tcpType = {
  id: 'tcp', name: 'TCP', color: '#475569', title: 'Test TCP port',
  fields: `
    <div class="row"><div><label>Host</label><input name="host" placeholder="example.com" required></div>
      <div><label>Port</label><input name="port" inputmode="numeric" pattern="[0-9]*" required></div></div>
    <div class="row2"><div><label>Connection attempts</label><input name="count" inputmode="numeric" value="3"></div>
      <div><label>Timeout (seconds)</label><input name="timeout" inputmode="numeric" value="5"></div></div>
    <label><input type="checkbox" name="banner"> Read the server banner (first 2 seconds)</label>`,
};

export const dnsType = {
  id: 'dns', name: 'DNS', color: '#0891b2', title: 'DNS lookup',
  fields: `
    <label>Domain</label><input name="name" placeholder="example.com" required>
    <div class="row2"><div><label>Record types</label><input name="types" value="A,MX,TXT" placeholder="A,AAAA,MX,TXT,NS,CNAME,SOA,CAA,SRV,PTR"></div>
      <div><label>DNS server <span class="muted">(blank = system)</span></label><input name="server" placeholder="1.1.1.1"></div></div>
    <label><input type="checkbox" name="mailAuth"> Check email authentication (SPF and DMARC)</label>
    <label>DKIM selector <span class="muted">(optional, needs the box above)</span></label><input name="dkimSelector" placeholder="default">`,
};

export const tlsType = {
  id: 'tls', name: 'TLS cert', color: '#65a30d', title: 'Check TLS certificate',
  fields: `
    <div class="row"><div><label>Host</label><input name="host" placeholder="example.com" required></div>
      <div><label>Port</label><input name="port" inputmode="numeric" pattern="[0-9]*" placeholder="443"></div></div>
    <div class="row2"><div><label>SNI name <span class="muted">(blank = host)</span></label><input name="servername"></div>
      <div><label>Warn when fewer days left than</label><input name="warnDays" inputmode="numeric" value="14"></div></div>
    <label><input type="checkbox" name="protocols"> Probe supported protocol versions (TLS 1.0 to 1.3)</label>`,
};
