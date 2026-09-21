import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PREFIX = 'enc:v1:';

// AES-256-GCM. Key comes from ENCRYPTION_KEY (any string) or an auto-generated <storage>/secret.key.
export function createCipher(dir) {
  let key;
  if (process.env.ENCRYPTION_KEY) {
    key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
  } else {
    const file = path.join(dir, 'secret.key');
    if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  }

  return {
    isEncrypted: (v) => typeof v === 'string' && v.startsWith(PREFIX),
    encrypt(plain) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
      return PREFIX + [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join(':');
    },
    // Returns null when the value cannot be decrypted (wrong/lost key).
    decrypt(value) {
      try {
        const [iv, tag, ct] = value.slice(PREFIX.length).split(':').map((s) => Buffer.from(s, 'base64'));
        const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
      } catch {
        return null;
      }
    },
  };
}
