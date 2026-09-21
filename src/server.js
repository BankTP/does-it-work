import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStorage } from './core/storage.js';
import { createSmtpService } from './services/smtp.js';
import { createMqttService } from './services/mqtt.js';
import { createHttpService } from './services/http.js';
import { createRedisService } from './services/redis.js';
import { createPostgresService, createMysqlService } from './services/sql.js';
import { createImapService, createPop3Service } from './services/mail-in.js';

const WEB_PORT = Number(process.env.WEB_PORT ?? 8025);
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? 'storage');

const { core, history } = openStorage(STORAGE_DIR);

// Register new services here. Each exposes POST /api/services/<id>/client/test
const services = [
  createSmtpService(), createMqttService(), createHttpService(), createRedisService(),
  createPostgresService(), createMysqlService(), createImapService(), createPop3Service(),
];

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '../public')));

app.get('/api/services', (_req, res) => res.json(services.map(({ id, name }) => ({ id, name }))));

// Saved configurations
const nameOf = (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) res.status(400).json({ error: 'name is required' });
  return name;
};
const idOf = (v) => (v === '' || v == null ? null : Number(v));
app.get('/api/configs', (_req, res) => res.json(core.configs.all()));
app.post('/api/services/:service/configs', (req, res) => {
  const name = nameOf(req, res); if (!name) return;
  res.json({ id: core.configs.create(req.params.service, name, req.body.data, idOf(req.body.folder_id)) });
});
app.get('/api/configs/:id', (req, res) => { const c = core.configs.getPublic(Number(req.params.id)); c ? res.json(c) : res.sendStatus(404); });
app.put('/api/configs/:id', (req, res) => {
  const name = nameOf(req, res); if (!name) return;
  core.configs.update(Number(req.params.id), name, req.body.data, idOf(req.body.folder_id), !!req.body.keep_secrets) ? res.json({ ok: true }) : res.sendStatus(404);
});
app.put('/api/configs/:id/move', (req, res) => {
  core.configs.move(Number(req.params.id), idOf(req.body?.folder_id)) ? res.json({ ok: true }) : res.sendStatus(404);
});
app.delete('/api/configs/:id', (req, res) => { core.configs.remove(Number(req.params.id)) ? res.sendStatus(204) : res.sendStatus(404); });

// Folders
app.get('/api/folders', (_req, res) => res.json(core.folders.all()));
app.post('/api/folders', (req, res) => {
  const name = nameOf(req, res); if (!name) return;
  res.json({ id: core.folders.create(name, idOf(req.body.parent_id)) });
});
app.put('/api/folders/:id', (req, res) => {
  const name = nameOf(req, res); if (!name) return;
  core.folders.rename(Number(req.params.id), name) ? res.json({ ok: true }) : res.sendStatus(404);
});
app.delete('/api/folders/:id', (req, res) => { core.folders.remove(Number(req.params.id)) ? res.sendStatus(204) : res.sendStatus(404); });

// History (SQLite)
app.get('/api/history', (req, res) => res.json(history.listAll(Math.min(Number(req.query.limit) || 100, 500))));
app.delete('/api/history', (_req, res) => { history.clearAll(); res.sendStatus(204); });
app.get('/api/services/:service/history', (req, res) => res.json(history.list(req.params.service, Math.min(Number(req.query.limit) || 100, 500))));
app.delete('/api/services/:service/history', (req, res) => { history.clear(req.params.service); res.sendStatus(204); });
app.get('/api/history/:id', (req, res) => { const r = history.get(Number(req.params.id)); r ? res.json(r) : res.sendStatus(404); });
app.delete('/api/history/:id', (req, res) => { history.remove(Number(req.params.id)) ? res.sendStatus(204) : res.sendStatus(404); });

for (const s of services) {
  const r = express.Router();
  // Record every client test (and live connect) automatically
  r.post(['/client/test', '/session/connect'], (req, res, next) => {
    // A saved config's password never leaves the server: fill it in when the form left it blank.
    const { configId, ...body } = req.body ?? {};
    req.body = body;
    if (configId) {
      const saved = core.configs.get(Number(configId));
      if (saved) for (const k of ['pass', 'password']) if (!body[k] && saved.data[k]) body[k] = saved.data[k];
    }
    const json = res.json.bind(res);
    res.json = (body) => { try { history.record(s.id, req.body, body); } catch (e) { console.error('[history]', e.message); } return json(body); };
    next();
  });
  s.routes(r);
  app.use(`/api/services/${s.id}`, r);
}

app.listen(WEB_PORT, () => console.log(`[web] http://localhost:${WEB_PORT}`));
