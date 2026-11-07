import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { loadFrontendModule } from './test-support/frontend-module.mjs';
const votingState = await loadFrontendModule(new URL('../src/app/brackets/state/voting-state.ts', import.meta.url));

// Exercise the actual component with deferred API requests; Angular's rendering
// and decorators are stubbed so no browser or additional test runner is needed.
const source=readFileSync(new URL('../src/app/brackets/feature/active-bracket-page.component.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
const core={Component:()=>()=>{},ViewChild:()=>()=>{},Output:()=>()=>{},EventEmitter:class{emit(){}}};
const context=createContext({exports:{},Error,AbortController,require:name=>name==='@angular/core'?core:name==='../state/voting-state'?votingState:{},setInterval,clearInterval});
runInContext(compiled,context);
const Component=context.exports.ActiveBracketPageComponent;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const data=(id,title=`Bracket ${id}`)=>({bracket:{bracketId:id,title,status:'active'},weeks:[],playlists:[],awaitingFinale:false,finaleModeActive:false});
function fixture(){
  const requests=[];
  const saves=[];
  let checks=0;
  const component=new Component({}, {}, {getVotingPage(id,signal){const request={id,signal,...deferred()};requests.push(request);return request.promise;},saveVote(...args){const save={args,...deferred()};saves.push(save);return save.promise;}}, {async getCurrentUser(){return {userId:7,role:'member'};}}, {markForCheck(){checks++;}});
  return {component,requests,saves,get checks(){return checks;}};
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


const votedData=(selectedEntryId=10,comment='Saved comment')=>({...data(1),canParticipateOnline:true,weeks:[{isCurrent:true,isReady:true,matchups:[{matchupId:11,selectedEntryId,comment,winnerEntryId:null}]}]});
const firstMatch=c=>c.data.weeks[0].matchups[0];
async function loadedVotes(){const f=fixture();const load=f.component.load(1);f.requests[0].resolve(votedData());await load;return f;}
async function pollVotes(f,selectedEntryId,comment){const poll=f.component.refresh();f.requests.at(-1).resolve(votedData(selectedEntryId,comment));await poll;}
const editComment=(c,match,value)=>c.updateComment(match,{target:{value}});

test('saved votes are read from refreshed data and are never hydrated into drafts',async()=>{
  const f=await loadedVotes(),c=f.component;
  assert.equal(Object.keys(c.picks).length,0);assert.equal(Object.keys(c.comments).length,0);
  await pollVotes(f,20,'Admin corrected this');
  assert.equal(c.songPick(firstMatch(c)),20);assert.equal(c.commentValue(firstMatch(c)),'Admin corrected this');
  const save=c.saveVote(firstMatch(c));
  assert.deepEqual(f.saves[0].args,[11,7,20,'Admin corrected this']);
  f.saves[0].resolve();await save;
});
test('only edited fields override polling; untouched fields follow server corrections',async()=>{
  const f=await loadedVotes(),c=f.component;
  c.pick(firstMatch(c),20);
  await pollVotes(f,10,'New server comment');
  assert.equal(c.songPick(firstMatch(c)),20);assert.equal(c.commentValue(firstMatch(c)),'New server comment');
  delete c.picks[11];
  editComment(c,firstMatch(c),'Unsaved note');
  await pollVotes(f,20,'Another server comment');
  assert.equal(c.songPick(firstMatch(c)),20);assert.equal(c.commentValue(firstMatch(c)),'Unsaved note');
});
test('reverting an edit removes the override; an empty edited comment is preserved',async()=>{
  const f=await loadedVotes(),c=f.component,match=firstMatch(c);
  c.pick(match,20);c.pick(match,10);
  editComment(c,match,'Draft');editComment(c,match,'Saved comment');
  assert.equal(Object.keys(c.picks).length,0);assert.equal(Object.keys(c.comments).length,0);
  await pollVotes(f,20,'Corrected comment');
  assert.equal(c.songPick(firstMatch(c)),20);assert.equal(c.commentValue(firstMatch(c)),'Corrected comment');
  editComment(c,firstMatch(c),'');await pollVotes(f,10,'Remote note');
  assert.equal(c.commentValue(firstMatch(c)),'');
});
test('successful submit updates a replaced matchup and releases submitted overrides',async()=>{
  const f=await loadedVotes(),c=f.component;
  c.pick(firstMatch(c),20);editComment(c,firstMatch(c),'Submitted note');
  const save=c.saveVote(firstMatch(c));
  await pollVotes(f,10,'Old poll data');
  f.saves[0].resolve();await save;
  assert.equal(firstMatch(c).selectedEntryId,20);assert.equal(firstMatch(c).comment,'Submitted note');
  assert.equal(Object.keys(c.picks).length,0);assert.equal(Object.keys(c.comments).length,0);
  await pollVotes(f,10,'Later correction');
  assert.equal(c.songPick(firstMatch(c)),10);assert.equal(c.commentValue(firstMatch(c)),'Later correction');
});
test('submission uses a snapshot and keeps subsequent unsaved edits',async()=>{
  const f=await loadedVotes(),c=f.component,match=firstMatch(c);
  c.pick(match,20);editComment(c,match,'Submit this');const save=c.saveVote(match);
  c.pick(match,10);editComment(c,match,'Saved comment');
  f.saves[0].resolve();await save;
  assert.deepEqual(f.saves[0].args,[11,7,20,'Submit this']);
  assert.equal(match.selectedEntryId,20);assert.equal(match.comment,'Submit this');
  assert.equal(c.songPick(match),10);assert.equal(c.commentValue(match),'Saved comment');
});
test('failed submissions retain genuine unsaved edits for retry',async()=>{
  const f=await loadedVotes(),c=f.component,match=firstMatch(c);
  c.pick(match,20);editComment(c,match,'Retry this');const save=c.saveVote(match);
  f.saves[0].reject(new Error('Save failed'));await save;
  assert.equal(match.selectedEntryId,10);assert.equal(c.songPick(match),20);assert.equal(c.commentValue(match),'Retry this');assert.equal(c.error,'Save failed');
});


test('a draft confirmed by polling stops overriding later server corrections',async()=>{
  const f=await loadedVotes(),c=f.component;
  c.pick(firstMatch(c),20);editComment(c,firstMatch(c),'Confirmed elsewhere');
  await pollVotes(f,20,'Confirmed elsewhere');
  assert.equal(Object.keys(c.picks).length,0);assert.equal(Object.keys(c.comments).length,0);
  await pollVotes(f,10,'Later admin correction');
  assert.equal(c.songPick(firstMatch(c)),10);assert.equal(c.commentValue(firstMatch(c)),'Later admin correction');
});
test('an old submission cannot change a newly selected bracket',async()=>{
  const f=await loadedVotes(),c=f.component;
  c.pick(firstMatch(c),20);const save=c.saveVote(firstMatch(c));
  const next=c.load(2);f.requests.at(-1).resolve(data(2));await next;
  f.saves[0].reject(new Error('Old save failed'));await save;
  assert.equal(c.data.bracket.bracketId,2);assert.equal(c.error,'');assert.equal(c.savingMatchupId,null);
  assert.equal(Object.keys(c.picks).length,0);
});


test('navigation and destruction abort the actual request signals',async()=>{
  const {component:c,requests}=fixture();
  const old=c.load(1);const next=c.load(2);
  assert.equal(requests[0].signal.aborted,true);assert.equal(requests[1].signal.aborted,false);
  c.ngOnDestroy();assert.equal(requests[1].signal.aborted,true);
  requests[0].resolve(data(1));requests[1].resolve(data(2));await Promise.all([old,next]);
  assert.equal(c.data,null);
});
