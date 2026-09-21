import { DatabaseSync } from 'node:sqlite';
import { createCipher } from './crypto.js';

export const SECRET_KEYS = new Set(['pass', 'password']);

// core.db: things worth keeping and backing up — saved configs and folders.
export function openCoreDb(file, dir) {
  const cipher = createCipher(dir);
  const db = new DatabaseSync(file);
  db.exec(`
  CREATE TABLE IF NOT EXISTS configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    folder_id INTEGER,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER
  );`);
  if (!db.prepare('PRAGMA table_info(configs)').all().some((c) => c.name === 'folder_id')) db.exec('ALTER TABLE configs ADD COLUMN folder_id INTEGER');

  // Passwords inside saved configs are encrypted at rest.
  const seal = (data = {}) => {
    const out = { ...data };
    for (const k of SECRET_KEYS) if (out[k]) out[k] = cipher.isEncrypted(out[k]) ? out[k] : cipher.encrypt(out[k]);
    return out;
  };
  const open = (data) => {
    for (const k of SECRET_KEYS) if (cipher.isEncrypted(data[k])) data[k] = cipher.decrypt(data[k]) ?? '';
    return data;
  };
  const cRow = (r) => r && { ...r, data: open(JSON.parse(r.data)) };
  const cAll = db.prepare('SELECT id, service, name, folder_id, data, updated_at FROM configs ORDER BY name COLLATE NOCASE');
  const hasSecret = (data) => [...SECRET_KEYS].some((k) => data[k]);
  // What the browser gets: never the password itself, only whether one is stored.
  const publicRow = (r) => {
    if (!r) return r;
    const data = JSON.parse(r.data);
    const has_secret = hasSecret(data);
    for (const k of SECRET_KEYS) delete data[k];
    return { ...r, data, has_secret };
  };
  const cGet = db.prepare('SELECT * FROM configs WHERE id = ?');
  const cIns = db.prepare('INSERT INTO configs (service, name, data, folder_id, updated_at) VALUES (?,?,?,?,?)');
  const cUpd = db.prepare('UPDATE configs SET name = ?, data = ?, folder_id = ?, updated_at = ? WHERE id = ?');
  const cMove = db.prepare('UPDATE configs SET folder_id = ? WHERE id = ?');
  const cDel = db.prepare('DELETE FROM configs WHERE id = ?');
  const fAll = db.prepare('SELECT * FROM folders ORDER BY name COLLATE NOCASE');
  const fIns = db.prepare('INSERT INTO folders (name, parent_id) VALUES (?,?)');
  const fRen = db.prepare('UPDATE folders SET name = ? WHERE id = ?');
  const fGet = db.prepare('SELECT * FROM folders WHERE id = ?');
  const fReparent = db.prepare('UPDATE folders SET parent_id = ? WHERE parent_id = ?');
  const fReconf = db.prepare('UPDATE configs SET folder_id = ? WHERE folder_id = ?');
  const fDel = db.prepare('DELETE FROM folders WHERE id = ?');

  // Encrypt any plaintext passwords left by older versions.
  for (const r of db.prepare('SELECT id, data FROM configs').all()) {
    const d = JSON.parse(r.data);
    if ([...SECRET_KEYS].some((k) => d[k] && !cipher.isEncrypted(d[k]))) db.prepare('UPDATE configs SET data = ? WHERE id = ?').run(JSON.stringify(seal(d)), r.id);
  }

  return {
    // Saved configurations (named presets). Passwords are stored only if the client includes them.
    configs: {
      all: () => cAll.all().map(({ data, ...r }) => ({ ...r, has_secret: hasSecret(JSON.parse(data)) })),
      get: (id) => cRow(cGet.get(id)), // decrypted — server side only
      getPublic: (id) => publicRow(cGet.get(id)),
      create: (service, name, data, folderId) =>
        Number(cIns.run(service, name, JSON.stringify(seal(data)), folderId ?? null, new Date().toISOString()).lastInsertRowid),
      // keepSecrets: retain the stored password(s) the client didn't resend
      update(id, name, data, folderId, keepSecrets = false) {
        const d = { ...(data ?? {}) };
        if (keepSecrets) {
          const cur = JSON.parse(cGet.get(id)?.data ?? '{}');
          for (const k of SECRET_KEYS) if (!d[k] && cur[k]) d[k] = cur[k];
        }
        return cUpd.run(name, JSON.stringify(seal(d)), folderId ?? null, new Date().toISOString(), id).changes > 0;
      },
      move: (id, folderId) => cMove.run(folderId ?? null, id).changes > 0,
      remove: (id) => cDel.run(id).changes > 0,
    },

    // Folders (nestable). Deleting a folder moves its contents up to the parent.
    folders: {
      all: () => fAll.all(),
      create: (name, parentId) => Number(fIns.run(name, parentId ?? null).lastInsertRowid),
      rename: (id, name) => fRen.run(name, id).changes > 0,
      remove(id) {
        const f = fGet.get(id);
        if (!f) return false;
        fReparent.run(f.parent_id, id);
        fReconf.run(f.parent_id, id);
        fDel.run(id);
        return true;
      },
    },
  };
}
