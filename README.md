# Does it work?

**A small local web app for checking whether a third-party service is reachable and behaves the way you expect.**

You've got credentials for an SMTP relay, an MQTT broker, or some other service. Before you wire them into your app, you want a quick answer: *does it work?* Does it connect, does authentication succeed, does TLS behave, does a message actually go through? This tool gives you a form, a **Run** button, and a full protocol transcript.

It runs on your machine, keeps your configs and history in a local SQLite file, and needs no account or cloud service.

## What it tests

| Type | What it does |
|------|--------------|
| **SMTP** | Connects to any SMTP server (plain, STARTTLS or SSL/TLS), optionally authenticates, and can send a real test email. Shows the full SMTP conversation (EHLO, AUTH, MAIL FROM, and so on) so you can see exactly where it fails. |
| **MQTT** | Connects to a broker over `mqtt://`, `mqtts://`, `ws://` or `wss://`, with optional credentials, client ID and MQTT version (3.1, 3.1.1, 5.0). Can subscribe to a topic, publish a message, and listen for incoming messages. |
| **HTTP** | Sends a request (any method, headers, body, Basic or Bearer auth), optionally follows redirects, and checks the status against what you expect (`200`, `2xx`, `200-299`). Shows the TLS details, response headers and a body preview. |
| **Redis** | Connects (optionally over TLS, with ACL user and database), sends `AUTH` and `PING`, shows the server version, and can run one command such as `GET key`. |
| **PostgreSQL / MySQL** | Connects and authenticates (TLS off, on, or verified), runs `SELECT 1` or your own query, and shows the server version. |
| **IMAP / POP3** | Logs in over SSL/TLS, STARTTLS or plain. IMAP lists folders and counts the messages in a mailbox; POP3 shows capabilities and the `STAT` count. |
| **TCP** | Opens the port several times and reports min/avg/max latency. Can read the server banner. |
| **DNS** | Looks up A, AAAA, MX, TXT, NS, CNAME, SOA, CAA, SRV or PTR records, optionally through a specific resolver. Can check SPF, DMARC and a DKIM selector. |
| **TLS cert** | Shows the certificate (subject, issuer, SANs, chain, expiry), checks trust and hostname, warns before expiry, and can probe which TLS versions the server accepts. |
| **SFTP / FTP(S)** | Logs in with a password (SFTP also with a private key), lists a directory, and can upload, read back and delete a probe file. FTP supports explicit and implicit TLS. |
| **LDAP** | Binds (anonymous, or with a DN and password) over LDAP, LDAPS or STARTTLS, and can run a search. |
| **S3** | Works with AWS, MinIO, R2 and others. Lists buckets or objects, and can put, read back and delete a probe object. |
| **AMQP / Kafka** | RabbitMQ: connects and can round-trip a message on a temporary queue. Kafka: connects (TLS and SASL), describes the cluster, lists topics, and can produce a message. |
| **WebSocket** | Like MQTT, a live connection: Connect, then send messages and pings and watch everything sent and received in a feed. Supports custom headers, subprotocols and a Bearer token. |
| **Syslog / SNMP** | Syslog: sends a message over UDP, TCP or TLS (RFC 5424 or 3164). SNMP: queries an agent (v1 or v2c) for the OIDs you choose. |

More service types can be added easily (see [Roadmap](#roadmap)), and adding one is small (see [Adding a new service type](#adding-a-new-service-type)).

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
- **Secrets are never written to the history.** That covers passwords, SFTP private keys and key passphrases. Saved configs store them only if you tick *Save password with this config*.
- **Saved secrets never go back to the browser.** When a config has a saved password, the form only shows a placeholder saying so. Leave the field blank to keep it (the server uses the stored one when you run the test), or type a new one to replace it.
- **Saved secrets are encrypted at rest** with AES-256-GCM. The key is `ENCRYPTION_KEY` if you set it, otherwise a random key in `storage/secret.key` (created with owner-only permissions). Secrets saved as plain text by earlier versions are encrypted automatically on startup.
- **What encryption does and doesn't protect.** With the auto-generated key, the key sits next to the database, so it protects against the database file leaking on its own (a stray copy, a backup, a commit) but not against someone who can read the whole `storage` folder. For stronger protection set `ENCRYPTION_KEY` and keep it outside `storage`. If the key is lost or changed, saved passwords cannot be recovered and you'll be asked to enter them again.
- SFTP accepts any host key (and logs its fingerprint), and the Syslog UDP test can't confirm delivery. Compare and check on the receiving side.
- Logs never contain your credentials: passwords, tokens and `Authorization` headers are masked in the transcript.
- Other details (hosts, usernames, and the protocol logs) are stored as plain text. Protect the `storage` folder accordingly.

## Roadmap

Every service type planned so far is built. Ideas for later:

- [ ] SNMPv3 (authentication and privacy)
- [ ] Kafka consume, and AMQP publish/consume to a queue you name
- [ ] SSH host-key pinning for SFTP (today any host key is accepted and its fingerprint is logged)
- [ ] IMAP: fetch a message header, and send-then-receive round trip with SMTP

## Adding a new service type

1. **Backend:** create `src/services/<id>.js` exporting a factory that returns `{ id, name, routes(router) }`. Its `routes` must add `POST /client/test`, which responds with `{ ok, ms, log[], error? }`. Register it in `src/server.js`.
2. **Frontend:** create `public/views/<id>.js` exporting `{ id, name, color, title, fields }`, where `fields` is the HTML for the form inputs. Add it to `types` in `public/app.js`.

History, saved configs, folders and tabs then work for the new type automatically.

## Tech

Node.js, Express, `nodemailer`, `mqtt`, `ioredis`, `pg`, `mysql2`, `imapflow`, `ssh2-sftp-client`, `basic-ftp`, `ldapts`, `@aws-sdk/client-s3`, `amqplib`, `kafkajs`, `ws`, `net-snmp`, and the built-in `node:sqlite`. The frontend is plain JavaScript with no build step.
