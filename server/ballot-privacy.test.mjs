import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBallotPrivacy} from './ballot-privacy.mjs';
const matchup={songA:{entryId:10},songB:{entryId:20},selectedEntryId:10,winnerEntryId:10,ballots:[{userId:1,displayName:'First voter',selectedEntryId:10},{userId:2,displayName:'Second voter',selectedEntryId:20},{userId:null,displayName:'Random tiebreaker',selectedEntryId:10}]};
test('anonymous members receive aggregate counts without vote identities',()=>{
  const result=applyBallotPrivacy(matchup,true,false);
  assert.deepEqual(result.ballots,[]);assert.equal(result.voteCountA,2);assert.equal(result.voteCountB,1);
  assert.equal(result.selectedEntryId,10);assert.equal(result.winnerEntryId,10);
  assert.ok(!JSON.stringify(result).includes('First voter'));assert.equal(matchup.ballots.length,3);
});
test('commissioners retain ballot access on anonymous brackets',()=>{
  assert.deepEqual(applyBallotPrivacy(matchup,true,true).ballots,matchup.ballots);
});
test('non-anonymous members retain ballot access',()=>{
  assert.deepEqual(applyBallotPrivacy(matchup,false,false).ballots,matchup.ballots);
});
test('historical totals are preserved without disclosing identified voter lists',()=>{
  const result=applyBallotPrivacy({...matchup,reportedVoteCountA:8,reportedVoteCountB:4},true,false);
  assert.equal(result.voteCountA,8);assert.equal(result.voteCountB,4);assert.deepEqual(result.ballots,[]);
});

test('anonymous historical results preserve only the signed-in users own selection',()=>{
  const {selectedEntryId,...history}=matchup;
  const result=applyBallotPrivacy(history,true,false,2);
  assert.equal(result.selectedEntryId,20);
  assert.deepEqual(result.ballots,[]);
  assert.equal(result.voteCountA,2);
  assert.equal(result.voteCountB,1);
  assert.ok(!JSON.stringify(result).includes('First voter'));
  assert.ok(!JSON.stringify(result).includes('Second voter'));
  assert.equal(applyBallotPrivacy(history,true,false,99).selectedEntryId,null);
});
