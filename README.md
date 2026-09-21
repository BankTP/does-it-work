# Does it work?

**A small local web app for checking whether a third-party service is reachable and behaves the way you expect.**

You've got credentials for an SMTP relay, an MQTT broker, or some other service. Before you wire them into your app, you want a quick answer: *does it work?* Does it connect, does authentication succeed, does TLS behave, does a message actually go through? This tool gives you a form, a **Run** button, and a full protocol transcript.

It runs on your machine, keeps your configs and history in a local SQLite file, and needs no account or cloud service.

## What it tests

| Type | What it does |
|------|--------------|
| **SMTP** | Connects to any SMTP server (plain, STARTTLS or SSL/TLS), optionally authenticates, and can send a real test email. Shows the full SMTP conversation (EHLO, AUTH, MAIL FROM, and so on) so you can see exactly where it fails. |
| **MQTT** | Connects to a broker over `mqtt://`, `mqtts://`, `ws://` or `wss://`, with optional credentials, client ID and MQTT version (3.1, 3.1.1, 5.0). Can subscribe to a topic, publish a message, and listen for incoming messages. |

More service types are planned, and adding one is small (see [Adding a new service type](#adding-a-new-service-type)).

## Features

- **Universal tabs.** Every test opens in a tab tagged with its type (SMTP, MQTT, ...). Use `+` to pick the type to add.
- **Run several at once.** Each tab has its own form and result, so you can run tests in parallel and compare them side by side.
- **Saved configs.** Give a setup a name and save it. Reopen it later, edit it, and run it again.
- **Folders.** Organise saved configs, across all service types, into nested folders. Choose a folder when saving, or drag items between folders.
- **History.** Every run is recorded, pass or fail, with its full log. Reopen any past run in a new tab to tweak and retry.
- **Light, dark and system themes.**
- **Local storage.** Saved configs and folders live in `storage/core.db`, and the run history in `storage/history.db` (both SQLite, git-ignored). The history is disposable; back up `core.db` (and `secret.key`).

## Quick start

Requires **Node.js 22 or newer**.

```bash
git clone <your-repo-url> does-it-work
cd does-it-work
npm install
npm start
```

Then open <http://localhost:8025>.

### Docker

```bash
cp .env.example .env      # optional: change the port
docker compose up -d --build
```

Saved configs and history are kept in `./storage`, which is mounted into the container, so they survive rebuilds.

If the service you're testing runs on your host machine, use `host.docker.internal` as the host from inside the container.

## Configuration

Set these in `.env` (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | `8025` | Port of the web UI. With Docker Compose this is the host port. |
| `STORAGE_DIR` | `storage` | Where the SQLite databases (`core.db`, `history.db`) and the encryption key are stored. |
| `ENCRYPTION_KEY` | *(auto)* | Optional passphrase used to encrypt saved passwords. If unset, a random key is generated in `storage/secret.key`. |

## Security notes

- **Run it only on your machine or a network you trust.** The server makes the outbound connections, so anyone who can reach the UI can make it connect to any host and port. There is no login.
- **Passwords are never written to the history.** Saved configs store a password only if you tick *Save password with this config*.
- **Saved passwords never go back to the browser.** When a config has a saved password, the form only shows a placeholder saying so. Leave the field blank to keep it (the server uses the stored one when you run the test), or type a new one to replace it.
- **Saved passwords are encrypted at rest** with AES-256-GCM. The key is `ENCRYPTION_KEY` if you set it, otherwise a random key in `storage/secret.key` (created with owner-only permissions). Passwords saved as plain text by earlier versions are encrypted automatically on startup.
- **What encryption does and doesn't protect.** With the auto-generated key, the key sits next to the database, so it protects against the database file leaking on its own (a stray copy, a backup, a commit) but not against someone who can read the whole `storage` folder. For stronger protection set `ENCRYPTION_KEY` and keep it outside `storage`. If the key is lost or changed, saved passwords cannot be recovered and you'll be asked to enter them again.
- SMTP logs never contain your credentials: they're masked in the transcript.
- Other details (hosts, usernames, and the protocol logs) are stored as plain text. Protect the `storage` folder accordingly.

## Adding a new service type

1. **Backend:** create `src/services/<id>.js` exporting a factory that returns `{ id, name, routes(router) }`. Its `routes` must add `POST /client/test`, which responds with `{ ok, ms, log[], error? }`. Register it in `src/server.js`.
2. **Frontend:** create `public/views/<id>.js` exporting `{ id, name, color, title, fields }`, where `fields` is the HTML for the form inputs. Add it to `types` in `public/app.js`.

History, saved configs, folders and tabs then work for the new type automatically.

## Tech

Node.js, Express, `nodemailer`, `mqtt`, and the built-in `node:sqlite`. The frontend is plain JavaScript with no build step.
