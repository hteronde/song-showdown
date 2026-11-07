import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import { authorizeBracketRequest } from './bracket-access.mjs';
import { bootstrapOwner } from './bootstrap-owner.mjs';
import { completePasswordReset, tokenHash } from './password-reset.mjs';
import { verifyPassword } from './passwords.mjs';

test('MySQL: two-family isolation and verified initial setup, expiry and replay', {skip:process.env.SECURITY_DB_TESTS!=='1'}, async()=>{
  const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||8889),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'music_bracket'});
  try {
    // Connection-local token storage isolates test invitations from real recovery links.
    await c.query(`CREATE TEMPORARY TABLE password_reset_tokens (
      token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,used_at DATETIME NULL)`);
    await c.beginTransaction();
    const suffix=randomBytes(8).toString('hex');
    const families=[],owners=[],members=[],brackets=[];
    for(let i=0;i<2;i++) {
      const [family]=await c.execute('INSERT INTO families (name) VALUES (?)',[`Security regression ${suffix} ${i}`]);
      families.push(Number(family.insertId));
      owners.push(await bootstrapOwner(c,{familyId:families[i],email:`security-owner-${suffix}-${i}@example.com`,displayName:'Test owner',appUrl:'https://example.com'}));
      const [member]=await c.execute("INSERT INTO users (family_id,email,display_name,role) VALUES (?,?,?,'member')",[families[i],`security-member-${suffix}-${i}@example.com`,'Test participant']);
      members.push(Number(member.insertId));
      const [bracket]=await c.execute("INSERT INTO brackets (family_id,created_by_user_id,title,artist,status) VALUES (?,?,?,?,'complete')",[families[i],owners[i].userId,'Security regression','Test']);
      brackets.push(Number(bracket.insertId));
      await c.execute('INSERT INTO bracket_members (bracket_id,family_id,user_id) VALUES (?,?,?)',[brackets[i],families[i],members[i]]);
    }
    for(let family=0;family<2;family++) {
      const own=brackets[family],other=brackets[1-family];
      for(const suffix of ['', '/voting','/finale-options']) {
        await authorizeBracketRequest(c,owners[family].userId,'GET',`/api/brackets/${own}${suffix}`);
        await authorizeBracketRequest(c,members[family],'GET',`/api/brackets/${own}${suffix}`);
        for(const userId of [owners[family].userId,members[family]]) {
          await assert.rejects(authorizeBracketRequest(c,userId,'GET',`/api/brackets/${other}${suffix}`),{status:404});
        }
      }
      for(const suffix of ['/finale','/finale/votes','/finale/participants','/finale/mode']) {
        await authorizeBracketRequest(c,owners[family].userId,'POST',`/api/brackets/${own}${suffix}`);
        await assert.rejects(authorizeBracketRequest(c,owners[family].userId,'POST',`/api/brackets/${other}${suffix}`),{status:404});
        await assert.rejects(authorizeBracketRequest(c,members[family],'POST',`/api/brackets/${own}${suffix}`),{status:404});
      }
    }
    // Use savepoints because all test records belong to the enclosing rollback transaction.
    const pool={async getConnection(){return {
      execute:(...args)=>c.execute(...args),
      beginTransaction:()=>c.query('SAVEPOINT setup_attempt'),
      commit:()=>c.query('RELEASE SAVEPOINT setup_attempt'),
      rollback:()=>c.query('ROLLBACK TO SAVEPOINT setup_attempt'),release(){}
    };}};
    await assert.rejects(completePasswordReset(pool,'','email alone cannot claim'),{status:400});
    const token=new URLSearchParams(new URL(owners[0].link).hash.slice(1)).get('resetToken');
    await c.execute('UPDATE password_reset_tokens SET expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE token_hash=?',[tokenHash(token)]);
    await assert.rejects(completePasswordReset(pool,token,'verified initial password'),{status:400});
    await c.execute('UPDATE password_reset_tokens SET expires_at=DATE_ADD(NOW(),INTERVAL 30 MINUTE) WHERE token_hash=?',[tokenHash(token)]);
    await completePasswordReset(pool,token,'verified initial password');
    await assert.rejects(completePasswordReset(pool,token,'replayed attacker password'),{status:400});
    const [[owner]]=await c.execute('SELECT password_hash FROM users WHERE user_id=?',[owners[0].userId]);
    assert.ok(await verifyPassword('verified initial password',owner.password_hash));
    const [[sessions]]=await c.execute('SELECT COUNT(*) AS total FROM auth_sessions WHERE user_id=?',[owners[0].userId]);
    assert.equal(Number(sessions.total),0);
  } finally {
    await c.rollback();
    await c.end();
  }
});
