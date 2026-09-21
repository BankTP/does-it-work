// UI definition for the SMTP tab type
export const smtpType = {
  id: 'smtp',
  name: 'SMTP',
  color: '#2563eb',
  title: 'Test SMTP server',
  fields: `
    <div class="row-h">
      <div><label>Host</label><input name="host" placeholder="smtp.example.com" required></div>
      <div><label>Port</label><input name="port" inputmode="numeric" pattern="[0-9]*" placeholder="25">
        <div class="chips">${[25, 2525, 465, 587].map((p) => `<button type="button" data-fill-name="port" data-fill-value="${p}">${p}</button>`).join('')}</div></div>
      <div><label class="lh">Security <span class="muted">Auto is usually best</span></label><select name="security">
        <option value="auto">Auto</option>
        <option value="none">None</option>
        <option value="ssl">SSL</option>
        <option value="starttls">TLS</option>
        <option value="opportunistic">TLS when available</option></select></div>
    </div>
    <div class="row2"><div><label>Username</label><input name="user" autocomplete="off"></div>
      <div><label>Password</label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>
    <label>Send a test email to <span class="muted">(leave empty to only test connection and login)</span></label>
    <input name="to" type="email" placeholder="you@example.com">
    <div class="row2"><div><label>Subject</label><input name="subject" value="SMTP test"></div>
      <div><label>From</label><input name="from" value="sender@example.test"></div></div>
    <label>Body</label><textarea name="text" rows="2">This is a test message.</textarea>
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`,
};
