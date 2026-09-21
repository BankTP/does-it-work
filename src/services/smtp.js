import nodemailer from 'nodemailer';

// Service contract: { id, name, routes(router) }
export function createSmtpService() {
  return {
    id: 'smtp',
    name: 'SMTP',
    routes(router) {
      // Client mode: test a 3rd-party SMTP server (verify connection, optionally send)
      router.post('/client/test', async (req, res) => {
        const b = req.body ?? {};
        const log = [];
        const started = Date.now();
        const push = (l) => log.push(`+${Date.now() - started}ms ${l}`);
        try {
          if (!b.host) throw new Error('host is required');
          const host = String(b.host).trim();
          if (!/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$|^\[?[0-9A-Fa-f:]+\]?$/.test(host)) {
            throw new Error(`invalid host "${host}" — enter a bare hostname like smtp.gmail.com (no "://", path or port)`);
          }
          const port = b.port === '' || b.port == null ? 25 : Number(b.port);
          if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be a number between 1 and 65535');
          // Security is independent of the port, except for 'auto':
          // auto (implicit TLS on 465, otherwise STARTTLS if offered) | none | ssl (implicit TLS)
          // | starttls (required) | opportunistic (STARTTLS if offered)
          let mode = b.security || 'auto';
          if (mode === 'auto') mode = port === 465 ? 'ssl' : 'opportunistic';
          const t = nodemailer.createTransport({
            host,
            port,
            secure: mode === 'ssl',
            requireTLS: mode === 'starttls',
            ignoreTLS: mode === 'none',
            auth: b.user ? { user: b.user, pass: b.pass ?? '' } : undefined,
            tls: { rejectUnauthorized: b.rejectUnauthorized !== false },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
            logger: {
              level: () => {}, trace: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {},
              debug: (_meta, msg, ...args) => push(String(msg).replace(/%[sd]/g, () => args.shift())),
            },
            debug: true,
          });
          await t.verify();
          push('VERIFY OK (connect' + (b.user ? ' + auth' : '') + ')');
          let messageId, response;
          if (!b.verifyOnly && b.to) { // no recipient = connection/auth test only
            const info = await t.sendMail({
              from: b.from || 'sender@example.test',
              to: b.to,
              subject: b.subject || 'Test mail',
              text: b.text || 'Test message',
              html: b.html || undefined,
            });
            messageId = info.messageId;
            response = info.response;
            push('SEND OK: ' + info.response);
          }
          t.close();
          res.json({ ok: true, messageId, response, ms: Date.now() - started, log });
        } catch (e) {
          push('ERROR: ' + e.message);
          res.status(200).json({ ok: false, error: e.message, code: e.code, response: e.response, ms: Date.now() - started, log });
        }
      });
    },
  };
}
