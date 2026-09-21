const fields = (defPort, defUser) => `
    <div class="row"><div><label>Host</label><input name="host" placeholder="db.example.com" required></div>
      <div><label>Port</label><input name="port" inputmode="numeric" pattern="[0-9]*" placeholder="${defPort}"></div></div>
    <div class="row2"><div><label>Username</label><input name="user" autocomplete="off" placeholder="${defUser}"></div>
      <div><label>Password</label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>
    <div class="row2"><div><label>Database <span class="muted">(optional)</span></label><input name="database"></div>
      <div><label>TLS</label><select name="ssl"><option value="disable">Off</option><option value="require">On (don't verify certificate)</option><option value="verify">On (verify certificate)</option></select></div></div>
    <label>Query <span class="muted">(blank = SELECT 1)</span></label>
    <input name="query" placeholder="SELECT 1">`;

// UI definitions for the PostgreSQL and MySQL tab types
export const postgresType = { id: 'postgres', name: 'PostgreSQL', color: '#336791', title: 'Test PostgreSQL server', fields: fields(5432, 'postgres') };
export const mysqlType = { id: 'mysql', name: 'MySQL', color: '#e48e00', title: 'Test MySQL server', fields: fields(3306, 'root') };
