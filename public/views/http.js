// UI definition for the HTTP/HTTPS tab type
export const httpType = {
  id: 'http',
  name: 'HTTP',
  color: '#0d9488',
  title: 'Test HTTP endpoint',
  fields: `
    <div class="row-h" style="grid-template-columns:110px 1fr">
      <div><label>Method</label><select name="method">${['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => `<option>${m}</option>`).join('')}</select></div>
      <div><label>URL</label><input name="url" placeholder="https://api.example.com/health" required></div>
    </div>
    <label>Headers <span class="muted">(one per line, Name: value)</span></label>
    <textarea name="headers" rows="2" placeholder="Accept: application/json"></textarea>
    <label>Body <span class="muted">(ignored for GET and HEAD)</span></label>
    <textarea name="body" rows="3" placeholder='{"hello":"world"}'></textarea>
    <div class="row2"><div><label>Authentication</label><select name="auth"><option value="none">None</option><option value="basic">Basic</option><option value="bearer">Bearer token</option></select></div>
      <div><label>Expected status <span class="muted">(200, 200,204, 2xx, 200-299)</span></label><input name="expected" value="2xx"></div></div>
    <div class="row2"><div><label>Username <span class="muted">(Basic)</span></label><input name="user" autocomplete="off"></div>
      <div><label>Password / token</label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>
    <label><input type="checkbox" name="follow" checked> Follow redirects</label>
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`,
};
