import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBracketEmail,sendBracketEmail} from './bracket-email.mjs';
const input={subject:'Hello bracket',body:'First line\n\nSecond line',requestId:'12345678-1234-1234-1234-123456789abc'};
const env={APP_URL:'https://example.com',RESEND_API_KEY:'test-only',EMAIL_FROM:'test@example.com'};
test('custom bracket email validates input',()=>{
  for(const change of [{subject:''},{subject:'x\nBcc: a'},{body:' '},{body:'x'.repeat(20001)},{requestId:undefined}])
    assert.throws(()=>parseBracketEmail({...input,...change}),{status:400});
});
test('custom bracket email sends individually, preserves text, reports partial failure and stable retry keys',async()=>{
  const pool={execute:async()=>[[{userId:1,email:'a@example.com'},{userId:2,email:'b@example.com'}]]};
  const messages=[];
  const options={env,pause:async()=>{},deliver:async(message,options)=>{messages.push({message,options});if(message.to==='b@example.com')throw Error('provider');}};
  assert.deepEqual(await sendBracketEmail(pool,5,input,options),{sent:1,failed:1});
  await sendBracketEmail(pool,5,input,options);
  assert.equal(messages[0].message.text,input.body);
  assert.equal(messages[0].message.subject,input.subject);
  assert.equal(messages[0].options.idempotencyKey,messages[2].options.idempotencyKey);
  assert.notEqual(messages[0].options.idempotencyKey,messages[1].options.idempotencyKey);
});
test('custom bracket email rejects missing provider and empty recipient list',async()=>{
  const pool={execute:async()=>[[]]};
  await assert.rejects(sendBracketEmail(pool,1,input,{env:{}}),{status:503});
  await assert.rejects(sendBracketEmail(pool,1,input,{env}),{status:400});
});
