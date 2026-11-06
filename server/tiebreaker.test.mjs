import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWinner, randomTiebreakerVote, validateSeedTiebreaker } from './tiebreaker.mjs';
const tied={votesForA:2,votesForB:2,songAEntryId:10,songBEntryId:20,songASeed:1,songBSeed:2};
test('majority wins regardless of tiebreaker',()=>{
  assert.equal(resolveWinner({...tied,votesForA:3,tiebreakerOption:'admin_pick',adminPick:20}),10);
});
test('random ties allow either song to win',()=>{
  assert.equal(resolveWinner({...tied,tiebreakerOption:'random'},()=>0),10);
  assert.equal(resolveWinner({...tied,tiebreakerOption:'random'},()=>1),20);
});
test('higher-ranked seed wins and equal seeds use random selection',()=>{
  assert.equal(resolveWinner({...tied,tiebreakerOption:'seed'}),10);
  assert.equal(resolveWinner({...tied,songASeed:8,tiebreakerOption:'seed'}),20);
  assert.equal(resolveWinner({...tied,songASeed:2,tiebreakerOption:'seed'},()=>1),20);
});
test('admin pick requires one of the matchup songs',()=>{
  assert.equal(resolveWinner({...tied,tiebreakerOption:'admin_pick',adminPick:20}),20);
  assert.equal(resolveWinner({...tied,tiebreakerOption:'admin_pick'}),null);
  assert.equal(resolveWinner({...tied,tiebreakerOption:'admin_pick',adminPick:99}),null);
});

test('records one system vote for ties using the random policy', () => {
  assert.equal(randomTiebreakerVote({...tied,tiebreakerOption:'random'},10),10);
  assert.equal(randomTiebreakerVote({...tied,tiebreakerOption:'random'},20),20);
  assert.equal(randomTiebreakerVote({...tied,tiebreakerOption:'seed'},10),null);
  assert.equal(randomTiebreakerVote({...tied,tiebreakerOption:'random',votesForA:3},10),null);
  assert.equal(randomTiebreakerVote({...tied,tiebreakerOption:'random',votesForA:0,votesForB:0},null),null);
});

test('zero votes use the configured tiebreaker and record random system votes',()=>{
  const empty={...tied,votesForA:0,votesForB:0};
  assert.equal(resolveWinner({...empty,tiebreakerOption:'random'},()=>0),10);
  assert.equal(resolveWinner({...empty,tiebreakerOption:'random'},()=>1),20);
  assert.equal(randomTiebreakerVote({...empty,tiebreakerOption:'random'},20),20);
  assert.equal(resolveWinner({...empty,tiebreakerOption:'seed'}),10);
  assert.equal(resolveWinner({...empty,tiebreakerOption:'admin_pick'}),null);
  assert.equal(resolveWinner({...empty,tiebreakerOption:'admin_pick',adminPick:20}),20);
});

test('lower-ranked seed policy advances the larger seed number only on ties',()=>{
  assert.equal(resolveWinner({...tied,tiebreakerOption:'seed_low'}),20);
  assert.equal(resolveWinner({...tied,songASeed:4,tiebreakerOption:'seed_low'}),10);
  assert.equal(resolveWinner({...tied,votesForA:3,tiebreakerOption:'seed_low'}),10);
  assert.equal(resolveWinner({...tied,votesForA:0,votesForB:0,tiebreakerOption:'seed_low'}),20);
  assert.equal(resolveWinner({...tied,songASeed:2,tiebreakerOption:'seed_low'},()=>0),10);
  assert.equal(resolveWinner({...tied,songASeed:2,tiebreakerOption:'seed_low'},()=>1),20);
});

test('seed tiebreakers require Use Seeds while other policies remain available',()=>{
  for(const option of ['seed','seed_low']) {
    assert.throws(()=>validateSeedTiebreaker(option,null),/Select Use Seeds/);
    validateSeedTiebreaker(option,4);
  }
  for(const option of ['random','admin_pick'])validateSeedTiebreaker(option,null);
});
