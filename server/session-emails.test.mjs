import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionEmail,processSessionEmails} from './session-emails.mjs';
import {deliverEmail} from './password-reset.mjs';
const row={bracketId:8,title:'Radiohead',artist:'Radiohead songs',weekNumber:2,roundName:'Sweet 16',email:'member@example.com',closesAt:'2026-11-12T20:45:00Z',eventType:'start'};
test('session emails include the Central-time deadline and bracket link',()=>{
  const message=sessionEmail(row,'https://thesongshowdown.com');
  assert.match(message.text,/begins now/);assert.match(message.text,/2:45 PM/);assert.match(message.text,/America\/Chicago/);assert.match(message.text,/https:\/\/thesongshowdown.com\/brackets\/8/);
  assert.match(sessionEmail({...row,closesAt:null},'https://thesongshowdown.com').text,/no fixed deadline/);
  const ended=sessionEmail({...row,eventType:'end'},'https://thesongshowdown.com');
  assert.match(ended.text,/Voting for this session is now closed/);assert.doesNotMatch(ended.text,/You have until/);
});
test('unconfigured email never queries or enqueues notifications',async()=>{
  assert.deepEqual(await processSessionEmails({execute(){throw Error('must not query');}},{env:{}}),{sent:0,failed:0});
});
test('Resend session retries use an idempotency header without including it in email content',async()=>{
  await deliverEmail({to:'member@example.com',subject:'Session',text:'Open now'},{env:{RESEND_API_KEY:'fake',EMAIL_FROM:'sender@example.com'},idempotencyKey:'session-test',fetchImpl:async(url,options)=>{
    assert.equal(options.headers['Idempotency-Key'],'session-test');assert.equal(JSON.parse(options.body).idempotencyKey,undefined);return {ok:true};
  }});
});

test('only the last online closing email announces the finale on its exact calendar date',()=>{
  const planned={...row,isLastOnlineSession:1,finaleDate:'2026-11-20'};
  const final=sessionEmail({...planned,eventType:'end'},'https://thesongshowdown.com');
  assert.match(final.text,/last session held online/);assert.match(final.text,/Friday, November 20, 2026/);assert.match(final.text,/We hope to see you there!/);
  assert.match(final.text,/https:\/\/thesongshowdown.com\/brackets\/8/);
  assert.doesNotMatch(sessionEmail(planned,'https://thesongshowdown.com').text,/last session held online/);
  assert.doesNotMatch(sessionEmail({...planned,eventType:'end',isLastOnlineSession:0},'https://thesongshowdown.com').text,/We hope to see you there/);
  assert.match(sessionEmail({...planned,eventType:'end',finaleDate:null},'https://thesongshowdown.com').text,/date has not been set/);
});
