import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAuthRateLimiter, createPasswordWorkLimit, readAuthInput, validatePassword, authBodyBytes } from './auth-abuse.mjs';

const request=(ip='127.0.0.1',method='POST')=>({socket:{remoteAddress:ip},method,headers:{}});
const body=input=>Readable.from([Buffer.from(JSON.stringify(input))]);
const login='/api/auth/login',forgot='/api/auth/forgot-password',reset='/api/auth/reset-password',setup='/api/auth/setup-password';

test('client login attempts are throttled before reading a body and recover after expiry',()=>{
  let clock=0;const limiter=createAuthRateLimiter({now:()=>clock});
  for(let i=0;i<30;i++)limiter.checkRequest(request(),login);
  assert.throws(()=>limiter.checkRequest(request(),login),{status:429,retryAfter:900});
  clock=900001;assert.doesNotThrow(()=>limiter.checkRequest(request(),login));
});
test('changing forwarded headers cannot evade the socket client limit',()=>{
  const limiter=createAuthRateLimiter();
  for(let i=0;i<10;i++){const req=request();req.headers['x-forwarded-for']=`198.51.100.${i}`;limiter.checkRequest(req,forgot);}
  assert.throws(()=>limiter.checkRequest(request(),forgot),{status:429});
});
test('account limits apply across clients and normalized email casing',async()=>{
  const limiter=createAuthRateLimiter();
  for(let i=0;i<10;i++)await readAuthInput(body({username:' User@Example.com ',password:'secret'}),login,limiter);
  await assert.rejects(readAuthInput(body({username:'user@example.com',password:'secret'}),login,limiter),{status:429});
  await readAuthInput(body({username:'other@example.com',password:'secret'}),login,limiter);
});
test('setup and reset share token and client budgets',()=>{
  const limiter=createAuthRateLimiter();
  for(let i=0;i<5;i++)limiter.checkSubject(i%2?setup:reset,{token:'a'.repeat(43)});
  assert.throws(()=>limiter.checkSubject(setup,{token:'a'.repeat(43)}),{status:429});
  for(let i=0;i<20;i++)limiter.checkRequest(request(),i%2?setup:reset);
  assert.throws(()=>limiter.checkRequest(request(),reset),{status:429});
});
test('all auth routes, including session reads, share an overall client budget',()=>{
  const limiter=createAuthRateLimiter();
  for(let i=0;i<120;i++)limiter.checkRequest(request('127.0.0.1','GET'),'/api/auth/session');
  assert.throws(()=>limiter.checkRequest(request(),login),{status:429});
  assert.doesNotThrow(()=>limiter.checkRequest(request('127.0.0.2'),login));
});
test('limiter storage is bounded and expired entries free capacity',()=>{
  let clock=0;const limiter=createAuthRateLimiter({now:()=>clock,maxEntries:1});
  limiter.checkRequest(request('127.0.0.1','GET'),'/api/auth/session');
  assert.throws(()=>limiter.checkRequest(request('127.0.0.2','GET'),'/api/auth/session'),{status:503,retryAfter:60});
  clock=60001;
  assert.doesNotThrow(()=>limiter.checkRequest(request('127.0.0.2','GET'),'/api/auth/session'));
});
test('auth inputs reject nonobjects, oversized identifiers, invalid tokens and password byte lengths',async()=>{
  const limiter=createAuthRateLimiter();
  for(const input of [null,[],{username:123,password:'pw'},{username:'x'.repeat(255),password:'pw'},{username:'',password:'pw'},{username:'a@b.com',password:'x'.repeat(1025)},{username:'a@b.com',password:'😀'.repeat(257)}]) {
    await assert.rejects(readAuthInput(body(input),login,limiter),{status:400});
  }
  for(const path of [setup,reset]) {
    await assert.rejects(readAuthInput(body({token:'not-a-token',password:'long password value'}),path,limiter),{status:400});
    await assert.rejects(readAuthInput(body({token:'a'.repeat(43),password:'short'}),path,limiter),{status:400});
  }
  assert.doesNotThrow(()=>validatePassword('x'.repeat(1024)));
});
test('auth body reads reject oversized content without consuming the entire stream',async()=>{
  let read=0;
  const oversized={async *[Symbol.asyncIterator](){read++;yield Buffer.alloc(authBodyBytes+1);read++;yield Buffer.from('ignored');}};
  await assert.rejects(readAuthInput(oversized,login,createAuthRateLimiter()),{status:413});
  assert.equal(read,1);
});
test('password work rejects excess jobs without queuing and releases slots on failure',async()=>{
  const run=createPasswordWorkLimit(1);let release;
  const pending=run(()=>new Promise(resolve=>{release=resolve;}));
  let executed=false;
  await assert.rejects(run(()=>{executed=true;}),{status:503,retryAfter:1});
  assert.equal(executed,false);
  release('done');assert.equal(await pending,'done');
  await assert.rejects(run(async()=>{throw new Error('Hash failed');}),/Hash failed/);
  assert.equal(await run(async()=>42),42);
});
