import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

// Exercise the actual component with deferred API requests; Angular's rendering
// and decorators are stubbed so no browser or additional test runner is needed.
const source=readFileSync(new URL('../src/app/brackets/feature/active-bracket-page.component.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
const core={Component:()=>()=>{},ViewChild:()=>()=>{},Output:()=>()=>{},EventEmitter:class{emit(){}}};
const context=createContext({exports:{},Error,require:name=>name==='@angular/core'?core:{},setInterval,clearInterval});
runInContext(compiled,context);
const Component=context.exports.ActiveBracketPageComponent;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const data=(id,title=`Bracket ${id}`)=>({bracket:{bracketId:id,title,status:'active'},weeks:[],playlists:[],awaitingFinale:false,finaleModeActive:false});
function fixture(){
  const requests=[];
  let checks=0;
  const component=new Component({}, {}, {getVotingPage(id){const request={id,...deferred()};requests.push(request);return request.promise;}}, {async getCurrentUser(){return {userId:7,role:'member'};}}, {markForCheck(){checks++;}});
  return {component,requests,get checks(){return checks;}};
}

test('a slow A response cannot overwrite B data, user state, picks, or comments',async()=>{
  const {component:c,requests}=fixture();
  const a=c.load(1),b=c.load(2);
  requests[1].resolve(data(2));await b;
  const stale=data(1);stale.weeks=[{matchups:[{matchupId:11,selectedEntryId:21,comment:'stale comment'}]}];
  requests[0].resolve(stale);await a;
  assert.equal(c.data.bracket.bracketId,2);
  assert.equal(c.currentMemberId,7);
  assert.equal(c.loading,false);
  assert.equal(Object.keys(c.picks).length,0);
  assert.equal(Object.keys(c.comments).length,0);
});
test('stale failures and finally blocks cannot set errors or stop B loading',async()=>{
  const f=fixture(),c=f.component;
  const a=c.load(1),b=c.load(2);
  requestsReject(f,0);await a;
  assert.equal(c.error,'');assert.equal(c.loading,true);assert.equal(c.data,null);assert.equal(f.checks,0);
  f.requests[1].resolve(data(2));await b;
  assert.equal(c.loading,false);
});
function requestsReject(f,index){f.requests[index].reject(new Error('Stale bracket failed'));}
test('the current failure still reports its error and clears loading',async()=>{
  const {component:c,requests}=fixture();const pending=c.load(2);
  requests[0].reject(new Error('Current failure'));await pending;
  assert.equal(c.error,'Current failure');assert.equal(c.loading,false);assert.equal(c.data,null);
});
test('A to B to A navigation rejects the original A load even though its ID matches',async()=>{
  const {component:c,requests}=fixture();
  const oldA=c.load(1),b=c.load(2),newA=c.load(1);
  requests[2].resolve(data(1,'Latest A'));await newA;
  requests[0].resolve(data(1,'Old A'));await oldA;
  requests[1].resolve(data(2));await b;
  assert.equal(c.data.bracket.title,'Latest A');
});
test('an old poll cannot overwrite a newer load or release a newer poll lock',async()=>{
  const {component:c,requests}=fixture();
  const initial=c.load(1);requests[0].resolve(data(1));await initial;
  const oldPoll=c.refresh();
  const route=c.load(1);requests[2].resolve(data(1,'Reloaded A'));await route;
  const newPoll=c.refresh();
  assert.equal(requests.length,4);
  requests[1].resolve(data(1,'Stale poll'));await oldPoll;
  assert.equal(c.data.bracket.title,'Reloaded A');
  await c.refresh();assert.equal(requests.length,4);
  requests[3].resolve(data(1,'Current poll'));await newPoll;
  assert.equal(c.data.bracket.title,'Current poll');
});
test('navigation clears previous data and drafts; destruction invalidates outstanding loads',async()=>{
  const f=fixture(),c=f.component;
  c.data=data(1);c.picks[1]=10;c.comments[1]='Old draft';
  const load=c.load(2);
  assert.equal(c.data,null);assert.equal(Object.keys(c.picks).length,0);assert.equal(Object.keys(c.comments).length,0);
  let unsubscribed=false;c.routeSubscription={unsubscribe(){unsubscribed=true;}};
  c.ngOnDestroy();f.requests[0].resolve(data(2));await load;
  assert.equal(c.data,null);assert.equal(f.checks,0);assert.equal(unsubscribed,true);
});


test('a failed stale poll is ignored after navigation',async()=>{
  const f=fixture(),c=f.component;
  const initial=c.load(1);f.requests[0].resolve(data(1));await initial;
  const poll=c.refresh();
  const next=c.load(2);f.requests[2].resolve(data(2));await next;
  f.requests[1].reject(new Error('Old poll failed'));
  await assert.doesNotReject(poll);
  assert.equal(c.data.bracket.bracketId,2);assert.equal(c.error,'');assert.equal(c.loading,false);
});
