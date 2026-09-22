const PROBE = '<label><input type="checkbox" name="probe"> Upload, read back and delete a probe file</label>';

// UI definitions for the SFTP, FTP(S) and S3 tab types
export const sftpType = {
  id: 'sftp', name: 'SFTP', color: '#b45309', title: 'Test SFTP server',
  fields: `
    <div class="row"><div><label>Host</label><input name="host" placeholder="sftp.example.com" required></div>
      <div><label>Port</label><input name="port" inputmode="numeric" pattern="[0-9]*" placeholder="22"></div></div>
    <div class="row2"><div><label>Username</label><input name="user" autocomplete="off" required></div>
      <div><label>Password <span class="muted">(or use a key)</span></label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>
    <label>Private key <span class="muted">(PEM/OpenSSH, replaces the password)</span></label>
    <textarea name="privateKey" data-secret rows="3" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" autocomplete="off" spellcheck="false"></textarea>
    <label>Key passphrase <span class="muted">(if the key is encrypted)</span></label><input name="passphrase" type="password" autocomplete="off">
    <label>Directory to list</label><input name="path" placeholder="." value=".">
    ${PROBE}`,
};

export const ftpType = {
  id: 'ftp', name: 'FTP', color: '#a16207', title: 'Test FTP / FTPS server',
  fields: `
    <div class="row"><div><label>Host</label><input name="host" placeholder="ftp.example.com" required></div>
      <div><label>Port <span class="muted">(blank = 21 / 990)</span></label><input name="port" inputmode="numeric" pattern="[0-9]*"></div></div>
    <label>Security</label>
    <select name="security"><option value="none">None (plain FTP)</option><option value="explicit">Explicit FTPS (AUTH TLS)</option><option value="implicit">Implicit FTPS (990)</option></select>
    <div class="row2"><div><label>Username <span class="muted">(blank = anonymous)</span></label><input name="user" autocomplete="off"></div>
      <div><label>Password</label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>
    <label>Directory to list</label><input name="path" value="/">
    ${PROBE}
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`,
};

export const s3Type = {
  id: 's3', name: 'S3', color: '#ea580c', title: 'Test S3-compatible storage',
  fields: `
    <label>Endpoint <span class="muted">(blank = AWS; e.g. https://minio.example.com:9000)</span></label><input name="endpoint" placeholder="https://s3.example.com">
    <div class="row2"><div><label>Region</label><input name="region" value="us-east-1"></div>
      <div><label>Bucket <span class="muted">(blank = list buckets)</span></label><input name="bucket"></div></div>
    <div class="row2"><div><label>Access key ID</label><input name="user" autocomplete="off" required></div>
      <div><label>Secret access key</label><input name="pass" type="password" autocomplete="off" required><!--save-pass--></div></div>
    <label>Key prefix <span class="muted">(optional)</span></label><input name="prefix" placeholder="folder/">
    <label><input type="checkbox" name="pathStyle"> Path-style addressing (MinIO and most self-hosted)</label>
    ${PROBE}
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`,
};
