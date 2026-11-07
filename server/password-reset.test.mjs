import test from 'node:test';
import assert from 'node:assert/strict';
import { completePasswordReset, resetLink, tokenHash } from './password-reset.mjs';

function database(valid) {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
    async execute(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT u.')) return [[{ user_id: 7 }]];
      if (sql.startsWith('SELECT user_id')) return [valid ? [{ user_id: 7 }] : []];
      return [{ affectedRows: 1 }];
    }
  };
  return { calls, async getConnection() { return connection; } };
}

test('reset links keep the secret in the fragment', () => {
  const url = new URL(resetLink('https://example.com/', 'secret'));
  assert.equal(url.search, '');
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('resetToken'), 'secret');
  assert.equal(tokenHash('secret').length, 64);
});

test('invalid tokens and short passwords never access the database', async () => {
  const pool = database(true);
  await assert.rejects(completePasswordReset(pool, 'bad', 'long password value'), { status: 400 });
  await assert.rejects(completePasswordReset(pool, 'a'.repeat(43), 'short'), { status: 400 });
  assert.equal(pool.calls.length, 0);
});

test('expired or used tokens roll back without changing the password', async () => {
  const pool = database(false);
  await assert.rejects(completePasswordReset(pool, 'a'.repeat(43), 'new password value'), { status: 400 });
  assert.ok(pool.calls.includes('rollback'));
  assert.ok(!pool.calls.some(call => call.sql?.startsWith('UPDATE')));
});

test('reset hashes password, consumes tokens, and revokes sessions atomically', async () => {
  const pool = database(true);
  await completePasswordReset(pool, 'a'.repeat(43), 'new password value');
  const updates = pool.calls.filter(call => call.sql?.startsWith('UPDATE'));
  assert.equal(updates.length, 3);
  assert.notEqual(updates[0].params[0], 'new password value');
  assert.match(updates[1].sql, /used_at = NOW/);
  assert.match(updates[2].sql, /auth_sessions SET revoked_at/);
  assert.ok(pool.calls.includes('commit'));
  assert.ok(!pool.calls.includes('rollback'));
});

test('initial password setup rejects email-only claims before database access',async()=>{
  const pool=database(true);
  await assert.rejects(completePasswordReset(pool,'','attacker chosen password'),{status:400});
  assert.equal(pool.calls.length,0);
});

test('a verified token initializes a password once; replay cannot claim or change it',async()=>{
  let used=false,storedHash=null;
  const c={async beginTransaction(){},async commit(){},async rollback(){},release(){},async execute(sql,params){
    if(sql.startsWith('SELECT u.'))return [[{user_id:7}]];
    if(sql.startsWith('SELECT user_id'))return [used?[]:[{user_id:7}]];
    if(sql.startsWith('UPDATE users'))storedHash=params[0];
    if(sql.startsWith('UPDATE password_reset_tokens'))used=true;
    return [{affectedRows:1}];
  }};
  const pool={async getConnection(){return c;}};
  await completePasswordReset(pool,'a'.repeat(43),'verified initial password');
  const firstHash=storedHash;
  assert.ok(firstHash);
  assert.notEqual(firstHash,'verified initial password');
  await assert.rejects(completePasswordReset(pool,'a'.repeat(43),'replayed attacker password'),{status:400});
  assert.equal(storedHash,firstHash);
});

test('well-formed but expired or unknown reset tokens never trigger password hashing',async()=>{
  let hashes=0;
  await assert.rejects(completePasswordReset(database(false),'a'.repeat(43),'valid length password',{hash:async()=>{hashes++;return 'hash';}}),{status:400});
  assert.equal(hashes,0);
});
test('reset hashing begins only after locking and validating the live token',async()=>{
  const pool=database(true);
  await completePasswordReset(pool,'a'.repeat(43),'valid length password',{hash:async()=>{
    const queries=pool.calls.filter(call=>call.sql).map(call=>call.sql);
    assert.equal(queries.length,2);
    assert.ok(queries.every(sql=>sql.includes('FOR UPDATE')));
    assert.match(queries[1],/expires_at > NOW\(\) AND used_at IS NULL/);
    return 'bounded password hash';
  }});
  assert.equal(pool.calls.find(call=>call.sql?.startsWith('UPDATE users')).params[0],'bounded password hash');
});
test('busy password hashing rolls back without consuming the reset token',async()=>{
  const pool=database(true);
  await assert.rejects(completePasswordReset(pool,'a'.repeat(43),'valid length password',{hash:async()=>{throw Object.assign(new Error('Busy'),{status:503});}}),{status:503});
  assert.ok(pool.calls.includes('rollback'));
  assert.ok(!pool.calls.some(call=>call.sql?.startsWith('UPDATE')));
});
