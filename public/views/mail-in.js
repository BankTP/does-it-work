const fields = (ssl, plain, autoText, extra = '') => `
    <div class="row"><div><label>Host</label><input name="host" placeholder="mail.example.com" required></div>
      <div><label>Port <span class="muted">(blank = default)</span></label><input name="port" inputmode="numeric" pattern="[0-9]*"></div></div>
    <label>Security</label>
    <select name="security"><option value="auto">Auto (${autoText})</option><option value="ssl">SSL/TLS (${ssl})</option><option value="starttls">STARTTLS (${plain})</option><option value="none">None (${plain})</option></select>
    <div class="row2"><div><label>Username</label><input name="user" autocomplete="off" required></div>
      <div><label>Password</label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>${extra}
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`;

// UI definitions for the IMAP and POP3 tab types
export const imapType = {
  id: 'imap', name: 'IMAP', color: '#7c3aed', title: 'Test IMAP mailbox',
  fields: fields(993, 143, 'TLS on 993, otherwise STARTTLS if offered', '\n    <label>Mailbox to count <span class="muted">(blank = INBOX)</span></label><input name="mailbox" placeholder="INBOX">'),
};
export const pop3Type = { id: 'pop3', name: 'POP3', color: '#c2410c', title: 'Test POP3 mailbox', fields: fields(995, 110, 'TLS on 995, otherwise plain') };
