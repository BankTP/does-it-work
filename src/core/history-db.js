import { DatabaseSync } from 'node:sqlite';
import { SECRET_KEYS } from './core-db.js';

// history.db: disposable log of test runs. Safe to delete at any time.
export function openHistoryDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL,
    created_at TEXT NOT NULL,
    target TEXT NOT NULL,
    ok INTEGER NOT NULL,
    ms INTEGER,
    request TEXT NOT NULL,
    result TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS runs_service ON runs(service, id DESC);`);

  const insert = db.prepare('INSERT INTO runs (service, created_at, target, ok, ms, request, result) VALUES (?,?,?,?,?,?,?)');
  const listAll = db.prepare('SELECT id, service, created_at, target, ok, ms FROM runs ORDER BY id DESC LIMIT ?');
  const list = db.prepare('SELECT id, service, created_at, target, ok, ms FROM runs WHERE service = ? ORDER BY id DESC LIMIT ?');
  const get = db.prepare('SELECT * FROM runs WHERE id = ?');
  const del = db.prepare('DELETE FROM runs WHERE id = ?');
  const clear = db.prepare('DELETE FROM runs WHERE service = ?');
  const clearAll = db.prepare('DELETE FROM runs');
  const row = (r) => r && { ...r, ok: !!r.ok, request: r.request && JSON.parse(r.request), result: r.result && JSON.parse(r.result) };

  return {
    // Passwords are never persisted.
    record(service, request, result) {
      const req = Object.fromEntries(Object.entries(request ?? {}).filter(([k]) => !SECRET_KEYS.has(k)));
      const target = [req.protocol || req.security, req.host && `${req.host}${req.port ? ':' + req.port : ''}`].filter(Boolean).join(' · ') || '(unknown)';
      insert.run(service, new Date().toISOString(), target, result.ok ? 1 : 0, result.ms ?? null, JSON.stringify(req), JSON.stringify(result));
    },
    listAll: (limit = 100) => listAll.all(limit).map(row),
    list: (service, limit = 100) => list.all(service, limit).map(row),
    get: (id) => row(get.get(id)),
    remove: (id) => del.run(id).changes > 0,
    clear: (service) => clear.run(service),
    clearAll: () => clearAll.run(),
  };
}
