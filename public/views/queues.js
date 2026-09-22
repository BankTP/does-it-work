// UI definitions for the AMQP (RabbitMQ) and Kafka tab types
export const amqpType = {
  id: 'amqp', name: 'AMQP', color: '#f97316', title: 'Test AMQP broker (RabbitMQ)',
  fields: `
    <div class="row"><div><label>Host</label><input name="host" placeholder="rabbit.example.com" required></div>
      <div><label>Port <span class="muted">(blank = 5672 / 5671)</span></label><input name="port" inputmode="numeric" pattern="[0-9]*"></div></div>
    <div class="row2"><div><label>Username</label><input name="user" autocomplete="off" placeholder="guest"></div>
      <div><label>Password</label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>
    <label>Virtual host</label><input name="vhost" value="/">
    <label><input type="checkbox" name="tls"> Use TLS (amqps://)</label>
    <label><input type="checkbox" name="roundtrip" checked> Publish and consume a message on a temporary queue</label>
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`,
};

export const kafkaType = {
  id: 'kafka', name: 'Kafka', color: '#111827', title: 'Test Kafka cluster',
  fields: `
    <label>Brokers <span class="muted">(comma separated host:port)</span></label><input name="brokers" placeholder="kafka1.example.com:9092,kafka2.example.com:9092" required>
    <div class="row2"><div><label>SASL</label><select name="sasl"><option value="none">None</option><option value="plain">PLAIN</option><option value="scram-sha-256">SCRAM-SHA-256</option><option value="scram-sha-512">SCRAM-SHA-512</option></select></div>
      <div><label>Client ID</label><input name="clientId" value="does-it-work"></div></div>
    <div class="row2"><div><label>Username</label><input name="user" autocomplete="off"></div>
      <div><label>Password</label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>
    <div class="row2"><div><label>Topic to produce to <span class="muted">(optional)</span></label><input name="topic"></div>
      <div><label>Message</label><input name="message" value="does-it-work probe"></div></div>
    <label><input type="checkbox" name="tls"> Use TLS</label>
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`,
};
