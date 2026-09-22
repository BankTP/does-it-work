// UI definition for the LDAP tab type
export const ldapType = {
  id: 'ldap', name: 'LDAP', color: '#4f46e5', title: 'Test LDAP server',
  fields: `
    <div class="row"><div><label>Host</label><input name="host" placeholder="ldap.example.com" required></div>
      <div><label>Port <span class="muted">(blank = 389 / 636)</span></label><input name="port" inputmode="numeric" pattern="[0-9]*"></div></div>
    <div class="row2"><div><label>Protocol</label><select name="protocol"><option value="ldap">ldap://</option><option value="ldaps">ldaps://</option></select></div>
      <div><label class="chk" style="margin-top:26px"><input type="checkbox" name="starttls"> Upgrade with STARTTLS</label></div></div>
    <div class="row2"><div><label>Bind DN <span class="muted">(blank = anonymous)</span></label><input name="user" autocomplete="off" placeholder="cn=admin,dc=example,dc=com"></div>
      <div><label>Password</label><input name="pass" type="password" autocomplete="off"><!--save-pass--></div></div>
    <label>Search base DN <span class="muted">(blank = bind only)</span></label><input name="baseDN" placeholder="dc=example,dc=com">
    <div class="row"><div><label>Filter</label><input name="filter" value="(objectClass=*)"></div>
      <div><label>Scope</label><select name="scope"><option value="sub">Subtree</option><option value="one">One level</option><option value="base">Base</option></select></div></div>
    <label><input type="checkbox" name="rejectUnauthorized" checked> Verify TLS certificate</label>`,
};
