import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { openCoreDb } from './core-db.js';
import { openHistoryDb } from './history-db.js';

const hasTable = (file, name) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); } finally { db.close(); }
};
const moveDb = (from, to) => {
  for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(from + ext)) fs.renameSync(from + ext, to + ext);
};

// Earlier versions kept everything in one file (history.db, then does-it-work.db).
// Turn it into core.db and move its runs table out into history.db.
function migrateLegacy(dir, coreFile, historyFile) {
  if (fs.existsSync(coreFile)) return;
  const legacy = ['does-it-work.db', 'history.db'].map((n) => path.join(dir, n)).find((f) => fs.existsSync(f) && hasTable(f, 'configs'));
  if (!legacy) return;
  moveDb(legacy, coreFile);
  const db = new DatabaseSync(coreFile);
  try {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='runs'").get()) {
      openHistoryDb(historyFile).clearAll(); // make sure history.db has the schema
      db.exec(`ATTACH DATABASE '${historyFile.replace(/'/g, "''")}' AS h;
        INSERT INTO h.runs (service, created_at, target, ok, ms, request, result)
          SELECT service, created_at, target, ok, ms, request, result FROM main.runs ORDER BY id;
        DROP TABLE main.runs; DETACH DATABASE h;`);
    }
  } finally { db.close(); }
}

export function openStorage(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const coreFile = path.join(dir, 'core.db');
  const historyFile = path.join(dir, 'history.db');
  migrateLegacy(dir, coreFile, historyFile);
  return { core: openCoreDb(coreFile, dir), history: openHistoryDb(historyFile) };
}
