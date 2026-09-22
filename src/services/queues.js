import amqp from 'amqplib';
import { Kafka, logLevel } from 'kafkajs';
import { clientTest, hostOf, portOf, timeoutMs, withTimeout } from './util.js';

// Service contract: { id, name, routes(router) }
export function createAmqpService() {
  return {
    id: 'amqp',
    name: 'AMQP',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const hostname = hostOf(b);
        const secure = b.tls === true;
        const port = portOf(b, secure ? 5671 : 5672);
        const timeout = timeoutMs(b);
        const vhost = b.vhost || '/';
        push(`connecting ${hostname}:${port} vhost "${vhost}" (${secure ? 'TLS' : 'plain'}) as ${b.user || 'guest'}`);
        const conn = await withTimeout(amqp.connect({
          protocol: secure ? 'amqps' : 'amqp', hostname, port, vhost,
          username: b.user || 'guest', password: b.pass ?? 'guest', heartbeat: 10,
        }, { rejectUnauthorized: b.rejectUnauthorized !== false, timeout, servername: hostname }), timeout + 500, 'connect');
        conn.on('error', () => {});
        try {
          const sp = conn.connection.serverProperties ?? {};
          push(`connected to ${sp.product ?? 'broker'} ${sp.version ?? ''}`.trim());
          const ch = await conn.createChannel();
          ch.on('error', () => {});
          if (b.roundtrip) {
            const { queue } = await ch.assertQueue('', { exclusive: true, autoDelete: true });
            const body = `does-it-work ${Date.now()}`;
            ch.sendToQueue(queue, Buffer.from(body));
            push(`published to temporary queue ${queue}`);
            let msg = false;
            for (let i = 0; i < 20 && !msg; i++) { msg = await ch.get(queue, { noAck: true }); if (!msg) await new Promise((r) => setTimeout(r, 100)); }
            if (!msg || msg.content.toString() !== body) throw new Error('message did not come back from the temporary queue');
            push('consumed message OK (round trip)');
          }
          await ch.close();
          return { response: `${sp.product ?? 'AMQP'} ${sp.version ?? ''}`.trim() };
        } finally {
          conn.close().catch(() => {});
        }
      }));
    },
  };
}

export function createKafkaService() {
  return {
    id: 'kafka',
    name: 'Kafka',
    routes(router) {
      router.post('/client/test', clientTest(async (b, push) => {
        const brokers = String(b.brokers || '').split(/[\s,]+/).filter(Boolean);
        if (!brokers.length) throw new Error('at least one broker (host:port) is required');
        for (const br of brokers) { const [h, p] = br.split(/:(?=[^:]*$)/); hostOf({ host: h }); portOf({ port: p }, 9092); }
        const timeout = timeoutMs(b);
        const mechanism = b.sasl || 'none';
        const kafka = new Kafka({
          clientId: b.clientId || 'does-it-work',
          brokers: brokers.map((x) => (x.includes(':') ? x : `${x}:9092`)),
          ssl: b.tls ? { rejectUnauthorized: b.rejectUnauthorized !== false } : false,
          sasl: mechanism === 'none' ? undefined : { mechanism, username: b.user ?? '', password: b.pass ?? '' },
          connectionTimeout: timeout,
          requestTimeout: timeout,
          retry: { retries: 0 },
          logLevel: logLevel.NOTHING,
        });
        const admin = kafka.admin();
        const producer = b.topic ? kafka.producer({ retry: { retries: 0 } }) : null;
        try {
          push(`connecting ${brokers.join(', ')} (${b.tls ? 'TLS' : 'plain'}, SASL ${mechanism})`);
          await withTimeout(admin.connect(), timeout + 500, 'connect');
          const cluster = await withTimeout(admin.describeCluster(), timeout, 'describeCluster');
          push(`cluster ${cluster.clusterId}: ${cluster.brokers.length} broker(s), controller ${cluster.controller}`);
          for (const br of cluster.brokers) push(`  broker ${br.nodeId} ${br.host}:${br.port}`);
          const topics = await withTimeout(admin.listTopics(), timeout, 'listTopics');
          push(`${topics.length} topic(s)`);
          if (producer) {
            await withTimeout(producer.connect(), timeout, 'producer connect');
            const r = await withTimeout(producer.send({ topic: b.topic, messages: [{ value: String(b.message ?? 'does-it-work probe') }] }), timeout, 'produce');
            push(`produced to ${b.topic} partition ${r[0].partition} offset ${r[0].baseOffset}`);
          }
          return { response: `${cluster.brokers.length} broker(s), ${topics.length} topic(s)` };
        } finally {
          await Promise.allSettled([admin.disconnect(), producer?.disconnect()]);
        }
      }));
    },
  };
}
