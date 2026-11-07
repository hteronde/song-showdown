import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './test-support/frontend-module.mjs';
const { createApiClient, ApiSession, ApiError, isApiCancelled, apiErrorMessage } = await loadFrontendModule(new URL('../src/app/shared/data-access/api-client.ts',import.meta.url));
const json=(payload,status=200,headers={})=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json',...headers}});
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const blockingFetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));

test('shared client adds credentials, JSON headers and body without leaking custom options',async()=>{
  let sent;
  const request=createApiClient({fetchImpl:async(url,init)=>{sent={url,...init};return json({saved:true});}});
  assert.deepEqual(await request('/api/example',{method:'POST',json:{a:1},headers:{'X-Custom':'yes'},errorMessage:'Fallback'}),{saved:true});
  assert.equal(sent.credentials,'include');assert.equal(sent.body,'{"a":1}');assert.equal(sent.headers.get('Content-Type'),'application/json');assert.equal(sent.headers.get('X-Custom'),'yes');assert.ok(sent.signal instanceof AbortSignal);assert.equal(sent.errorMessage,undefined);
});
test('HTTP errors retain reset confirmation details, status and retry hints',async()=>{
  const request=createApiClient({fetchImpl:async()=>json({error:'Confirm reset',requiresReset:true},409,{'Retry-After':'10'})});
  await assert.rejects(request('/api/example'),error=>error instanceof ApiError && error.status===409 && error.requiresReset && error.message==='Confirm reset' && error.retryAfter==='10');
});
test('invalid success bodies and failed HTML responses become safe normalized errors',async()=>{
  await assert.rejects(createApiClient({fetchImpl:async()=>new Response('<html>Oops</html>')})('/api/example'),{code:'invalid-response'});
  await assert.rejects(createApiClient({fetchImpl:async()=>new Response('<html>Oops</html>',{status:502})})('/api/example',{errorMessage:'Could not load bracket.'}),{code:'http',status:502,message:'Could not load bracket.'});
  assert.deepEqual(await createApiClient({fetchImpl:async()=>new Response(null,{status:204})})('/api/example'),{});
});
test('network failures and timeouts have consistent errors; writes are never automatically retried',async()=>{
  let calls=0;
  await assert.rejects(createApiClient({fetchImpl:async()=>{calls++;throw new TypeError('Internal network details');}})('/api/example',{method:'POST'}),{code:'network'});
  assert.equal(calls,1);
  await assert.rejects(createApiClient({fetchImpl:blockingFetch,timeoutMs:5})('/api/example'),{code:'timeout'});
});
test('caller cancellation is distinct from a timeout and an already aborted request never fetches',async()=>{
  const controller=new AbortController();
  const pending=createApiClient({fetchImpl:blockingFetch})('/api/example',{signal:controller.signal});
  controller.abort();
  await assert.rejects(pending,error=>isApiCancelled(error) && apiErrorMessage(error)==='');
  let calls=0;
  await assert.rejects(createApiClient({fetchImpl:async()=>{calls++;return json({});}})('/api/example',{signal:controller.signal}),{code:'cancelled'});
  assert.equal(calls,0);
});
test('timeout includes reading the response body, not just receiving headers',async()=>{
  const request=createApiClient({timeoutMs:5,fetchImpl:async(_url,{signal})=>({ok:true,status:200,headers:new Headers(),text:()=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Body aborted')),{once:true}))})});
  await assert.rejects(request('/api/example'),{code:'timeout'});
});
test('protected 401 expires the session once and cancels other pending protected requests',async()=>{
  const session=new ApiSession();session.start();let expired=0;session.onExpired(()=>expired++);
  const request=createApiClient({session,fetchImpl:(url,init)=>url==='/api/expired'?Promise.resolve(json({error:'Login required'},401)):blockingFetch(url,init)});
  const other=request('/api/poll');const rejected=assert.rejects(other,{code:'cancelled'});
  await assert.rejects(request('/api/expired'),{code:'http',status:401,message:'Your session has expired. Please log in again.'});await rejected;
  await assert.rejects(request('/api/expired'),{status:401});assert.equal(expired,1);
});
test('a normal signed-out session check triggers no expiry notification',async()=>{
  const session=new ApiSession();let expired=0;session.onExpired(()=>expired++);
  const request=createApiClient({session,fetchImpl:async()=>json({authenticated:false,user:null})});
  await request('/api/auth/session',{session:'check'});assert.equal(expired,0);
  session.start();await request('/api/auth/session',{session:'check'});assert.equal(expired,1);
});
test('bad login credentials and forbidden responses do not expire an existing session',async()=>{
  const session=new ApiSession();session.start();let expired=0;session.onExpired(()=>expired++);
  const request=createApiClient({session,fetchImpl:async url=>json({error:url==='/api/auth/login'?'Wrong password':'Forbidden'},url==='/api/auth/login'?401:403)});
  await assert.rejects(request('/api/auth/login',{session:'public'}),{status:401,message:'Wrong password'});
  await assert.rejects(request('/api/private'),{status:403});assert.equal(expired,0);
});
test('an old unauthorized response cannot expire a newer login',async()=>{
  const session=new ApiSession();session.start();let expired=0;session.onExpired(()=>expired++);
  const response=deferred();const request=createApiClient({session,fetchImpl:()=>response.promise});
  const pending=request('/api/old');session.start();const generation=session.generation;
  response.resolve(json({},401));await assert.rejects(pending,{code:'cancelled'});
  assert.equal(expired,0);assert.equal(session.generation,generation);
});
test('ending a session aborts protected work without emitting expiry, and listeners can unsubscribe',async()=>{
  const session=new ApiSession();session.start();let expired=0;const unsubscribe=session.onExpired(()=>expired++);
  const pending=createApiClient({session,fetchImpl:blockingFetch})('/api/poll');session.end();await assert.rejects(pending,{code:'cancelled'});
  assert.equal(expired,0);session.start();unsubscribe();session.expire(session.generation);assert.equal(expired,0);
});
