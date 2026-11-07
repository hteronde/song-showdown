import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapOwner } from './bootstrap-owner.mjs';
import { tokenHash } from './password-reset.mjs';
const input={familyId:10,email:'owner@example.com',displayName:'Owner',appUrl:'https://example.com'};
test('operator bootstrap creates the first owner and a hashed single-use setup token',async()=>{
  const calls=[];
  const c={async execute(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT family_id'))return [[{family_id:10}]];if(sql.startsWith('SELECT user_id'))return [[]];return [{insertId:7}];}};
  const result=await bootstrapOwner(c,input);
  const token=new URLSearchParams(new URL(result.link).hash.slice(1)).get('resetToken');
  assert.equal(result.userId,7);
  assert.equal(calls[3].args[0],tokenHash(token));
  assert.match(calls[0].sql,/FOR UPDATE/);
  assert.match(calls[3].sql,/INTERVAL 30 MINUTE/);
});
test('bootstrap cannot replace an existing owner or claim an existing email',async()=>{
  let writes=0;
  const c={async execute(sql){if(sql.startsWith('SELECT family_id'))return [[{family_id:10}]];if(sql.startsWith('SELECT user_id'))return [[{user_id:1}]];writes++;throw new Error('Unexpected write');}};
  await assert.rejects(bootstrapOwner(c,input),/already has an owner/);
  assert.equal(writes,0);
  const duplicate={async execute(sql){if(sql.startsWith('SELECT family_id'))return [[{family_id:10}]];if(sql.startsWith('SELECT user_id'))return [[]];throw Object.assign(new Error('Duplicate'),{code:'ER_DUP_ENTRY'});}};
  await assert.rejects(bootstrapOwner(duplicate,input),{code:'ER_DUP_ENTRY'});
});
