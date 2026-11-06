import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEmailChanges,saveParticipantEmails} from './participant-emails.mjs';
const change={userId:2,email:' New@Example.com ',previousEmail:'old@example.com'};
test('email changes normalize addresses and reject invalid batches',()=>{
 assert.deepEqual(validateEmailChanges([change]),[{...change,email:'new@example.com'}]);
 for(const input of [[],null,[change,change],[{...change,email:'invalid'}],[{...change,email:'a'.repeat(255)+'@example.com'}],[{...change,userId:0}],[{...change,previousEmail:null}]])assert.throws(()=>validateEmailChanges(input));
});
test('email updates are scoped to the family and return saved addresses',async()=>{
 const calls=[];const c={execute:async(sql,args)=>{calls.push({sql,args});return sql.startsWith('SELECT')?[[{userId:2,email:'old@example.com'}]]:[{affectedRows:1}];}};
 assert.deepEqual(await saveParticipantEmails(c,7,{changes:[change]}),{members:[{userId:2,email:'new@example.com'}]});
 assert.match(calls[0].sql,/family_id=\?/);assert.deepEqual(calls[0].args,[7,2]);
 assert.deepEqual(calls[1].args,['new@example.com',2,7]);assert.match(calls[1].sql,/user_id=\? AND family_id=\?/);
});
test('out-of-family and stale email edits perform no writes',async()=>{
 for(const members of [[],[{userId:2,email:'changed@example.com'}]]) {
  const calls=[];const c={execute:async(sql)=>{calls.push(sql);return [members];}};
  await assert.rejects(saveParticipantEmails(c,7,{changes:[change]}),error=>[403,409].includes(error.status));
  assert.equal(calls.length,1);
 }
});
