import crypto from 'node:crypto';
import https from 'node:https';
import { Readable, Writable } from 'node:stream';
import SftpClient from 'ssh2-sftp-client';
import * as ftp from 'basic-ftp';
import { S3Client, ListBucketsCommand, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { clientTest, hostOf, portOf, timeoutMs, withTimeout } from './util.js';

const LIST_LIMIT = 30;
const probeName = () => `.does-it-work-${crypto.randomBytes(4).toString('hex')}.txt`;
const PROBE_BODY = () => Buffer.from(`does-it-work probe ${new Date().toISOString()}\n`);
const joinPath = (dir, name) => `${dir.replace(/\/+$/, '')}/${name}`;

// Service contract: { id, name, routes(router) }
export function createSftpService() {
  return {
    id: 'sftp',
    name: 'SFTP',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        const port = portOf(b, 22);
        const timeout = timeoutMs(b);
        if (!b.user) throw new Error('username is required');
        if (!b.pass && !b.privateKey) throw new Error('a password or a private key is required');
        const dir = String(b.path || '.').trim();
        const sftp = new SftpClient();
        sftp.client.on('error', () => {});
        try {
          push(`connecting ${host}:${port} as ${b.user} (${b.privateKey ? 'private key' : 'password'})`);
          await withTimeout(sftp.connect({
            host, port, username: b.user,
            password: b.privateKey ? undefined : b.pass,
            privateKey: b.privateKey || undefined,
            passphrase: b.passphrase || undefined,
            readyTimeout: timeout,
            // A test tool accepts any host key but reports its fingerprint so you can compare it.
            hostHash: 'sha256',
            hostVerifier: (fp) => { push(`host key SHA256:${Buffer.from(fp, 'hex').toString('base64').replace(/=+$/, '')}`); return true; },
          }), timeout + 1000, 'connect');
          push('authenticated');
          const items = await sftp.list(dir);
          push(`LIST ${dir}: ${items.length} item(s)`);
          for (const f of items.slice(0, LIST_LIMIT)) push(`  ${f.type === 'd' ? 'd' : '-'} ${String(f.size).padStart(10)} ${f.name}`);
          if (items.length > LIST_LIMIT) push(`  … ${items.length - LIST_LIMIT} more`);
          if (b.probe) {
            const remote = joinPath(dir === '.' ? await sftp.cwd() : dir, probeName());
            const body = PROBE_BODY();
            await sftp.put(Buffer.from(body), remote);
            push(`uploaded probe ${remote} (${body.length}B)`);
            try {
              const back = await sftp.get(remote);
              push(Buffer.compare(back, body) === 0 ? 'read back OK (content matches)' : 'read back MISMATCH');
              if (Buffer.compare(back, body) !== 0) throw new Error('probe content mismatch');
            } finally {
              await sftp.delete(remote);
              push('deleted probe');
            }
          }
          return { response: `${items.length} item(s) in ${dir}` };
        } finally {
          sftp.end().catch(() => {});
        }
      }));
    },
  };
}

export function createFtpService() {
  return {
    id: 'ftp',
    name: 'FTP',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const host = hostOf(b);
        const security = b.security || 'none'; // none | explicit (AUTH TLS) | implicit
        const port = portOf(b, security === 'implicit' ? 990 : 21);
        const timeout = timeoutMs(b);
        const dir = String(b.path || '/').trim();
        const client = new ftp.Client(timeout);
        client.ftp.verbose = true;
        client.ftp.log = (m) => push(m); // basic-ftp already redacts the PASS command
        try {
          push(`connecting ${host}:${port} (${security === 'none' ? 'plain' : security + ' TLS'})`);
          await client.access({
            host, port,
            user: b.user || 'anonymous',
            password: b.user ? b.pass ?? '' : 'anonymous@',
            secure: security === 'implicit' ? 'implicit' : security === 'explicit',
            secureOptions: { rejectUnauthorized: b.rejectUnauthorized !== false, servername: host },
          });
          push('logged in');
          const items = await client.list(dir);
          push(`LIST ${dir}: ${items.length} item(s)`);
          for (const f of items.slice(0, LIST_LIMIT)) push(`  ${f.isDirectory ? 'd' : '-'} ${String(f.size).padStart(10)} ${f.name}`);
          if (b.probe) {
            const name = probeName();
            const remote = joinPath(dir, name);
            const body = PROBE_BODY();
            await client.uploadFrom(Readable.from(body), remote);
            push(`uploaded probe ${remote} (${body.length}B)`);
            try {
              const chunks = [];
              await client.downloadTo(new Writable({ write(c, _e, cb) { chunks.push(c); cb(); } }), remote);
              const ok = Buffer.compare(Buffer.concat(chunks), body) === 0;
              push(ok ? 'read back OK (content matches)' : 'read back MISMATCH');
              if (!ok) throw new Error('probe content mismatch');
            } finally {
              await client.remove(remote);
              push('deleted probe');
            }
          }
          return { response: `${items.length} item(s) in ${dir}` };
        } finally {
          client.close();
        }
      }));
    },
  };
}

export function createS3Service() {
  return {
    id: 's3',
    name: 'S3',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const timeout = timeoutMs(b);
        if (!b.user || !b.pass) throw new Error('access key ID and secret access key are required');
        const endpoint = String(b.endpoint || '').trim() || undefined;
        if (endpoint && !/^https?:\/\//.test(endpoint)) throw new Error('endpoint must start with http:// or https:// (leave blank for AWS)');
        const bucket = String(b.bucket || '').trim();
        const s3 = new S3Client({
          region: b.region || 'us-east-1',
          endpoint,
          forcePathStyle: !!b.pathStyle,
          credentials: { accessKeyId: b.user, secretAccessKey: b.pass },
          maxAttempts: 1,
          requestHandler: new NodeHttpHandler({
            connectionTimeout: timeout,
            requestTimeout: timeout,
            httpsAgent: new https.Agent({ rejectUnauthorized: b.rejectUnauthorized !== false }),
          }),
        });
        try {
          push(`endpoint ${endpoint ?? 'AWS'} region ${b.region || 'us-east-1'}${b.pathStyle ? ' (path-style)' : ''}`);
          if (!bucket) {
            const r = await s3.send(new ListBucketsCommand({}));
            push(`ListBuckets: ${r.Buckets?.length ?? 0} bucket(s)`);
            for (const x of (r.Buckets ?? []).slice(0, LIST_LIMIT)) push(`  ${x.Name}`);
            return { response: `${r.Buckets?.length ?? 0} bucket(s)` };
          }
          const prefix = String(b.prefix || '').trim() || undefined;
          const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 10 }));
          push(`ListObjectsV2 ${bucket}/${prefix ?? ''}: ${r.KeyCount ?? 0} object(s)${r.IsTruncated ? '+' : ''}`);
          for (const o of r.Contents ?? []) push(`  ${String(o.Size).padStart(10)} ${o.Key}`);
          if (b.probe) {
            const key = `${prefix ?? ''}${probeName()}`;
            const body = PROBE_BODY();
            await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
            push(`PutObject ${key} (${body.length}B)`);
            try {
              const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
              const ok = Buffer.compare(Buffer.from(await got.Body.transformToByteArray()), body) === 0;
              push(ok ? 'GetObject OK (content matches)' : 'GetObject MISMATCH');
              if (!ok) throw new Error('probe content mismatch');
            } finally {
              await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
              push('DeleteObject OK');
            }
          }
          return { response: `${r.KeyCount ?? 0} object(s) listed in ${bucket}` };
        } catch (e) {
          throw new Error(`${e.name}: ${e.message}`);
        } finally {
          s3.destroy();
        }
      }));
    },
  };
}
