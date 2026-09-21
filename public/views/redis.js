// UI definition for the Redis tab type
export const redisType = {
  id: 'redis',
  name: 'Redis',
  color: '#dc2626',
  title: 'Test Redis server',
  fields: `
    <div class="row"><div><label>Host</label><input name="host" placeholder="redis.example.com" required></div>
      <div><label>Port</label><input name="port" inputmode="numeric" pattern="[0-9]*" placeholder="6379"></div></div>
    <div class="row2"><div><label>Username <span class="muted">(ACL, optional)</span></label><input name="user" autocomplete="off"></div>
      <div><label>Password</label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>
    <div class="row2"><div><label>Database</label><input name="db" inputmode="numeric" pattern="[0-9]*" placeholder="0"></div>
      <div><label>Command <span class="muted">(optional)</span></label><input name="command" placeholder="GET mykey  or  SET mykey hello"></div></div>
    <label><input type="checkbox" name="tls"> Use TLS (rediss://)</label>
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`,
};
