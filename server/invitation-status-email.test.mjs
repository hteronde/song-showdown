import test from 'node:test';
import assert from 'node:assert/strict';
import {invitationStatusEmail,sendInvitationStatusEmails} from './invitation-status-email.mjs';
const env={APP_URL:'https://thesongshowdown.com',RESEND_API_KEY:'fake',EMAIL_FROM:'sender@example.com'};
const change={email:'participant@example.com',title:'Radiohead',artist:'Radiohead songs',bracketId:42,previousStatus:'declined',status:'accepted'};
test('status notifications explain acceptance and declining without promising immediate voting',()=>{
  const accepted=invitationStatusEmail(change,env.APP_URL);
  assert.equal(accepted.to,change.email);assert.match(accepted.subject,/Accepted: Radiohead/);
  assert.match(accepted.text,/Theme: Radiohead songs/);assert.match(accepted.text,/Voting opens at the scheduled start/);
  assert.match(accepted.text,/https:\/\/thesongshowdown.com\/brackets\/42/);
  const declined=invitationStatusEmail({...change,status:'declined',previousStatus:'accepted'},env.APP_URL);
  assert.match(declined.subject,/Declined/);assert.match(declined.text,/cannot access its matchups or vote/);
});
test('delivery failure is counted without preventing other recipients from being notified',async()=>{
  const sent=[];
  const result=await sendInvitationStatusEmails([change,{...change,email:'second@example.com',status:'declined'}],{env,deliver:async message=>{if(message.to===change.email)throw Error('provider failure');sent.push(message);}});
  assert.deepEqual(result,{sent:1,failed:1});assert.equal(sent.length,1);
  assert.deepEqual(await sendInvitationStatusEmails([],{env}),{sent:0,failed:0});
});
