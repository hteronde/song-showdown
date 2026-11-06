import test from 'node:test';
import assert from 'node:assert/strict';
import { correctedWinner, validateBallotEdits, ballotRevision, roundAllowsBallotEditing } from './admin-ballots.mjs';
const match={songAEntryId:10,songBEntryId:20,songASeed:1,songBSeed:2,isClosed:1,tiebreakerOption:'random',createdBy:1,winnerEntryId:10,randomVote:10};
const people=[{userId:1,role:'owner',selectedEntryId:10},{userId:2,role:'member',selectedEntryId:20},{userId:3,role:'member',selectedEntryId:null}];
test('late votes replace a previous random tie with a majority',()=>{
  assert.deepEqual(correctedWinner(match,people.map(p=>p.userId===3?{...p,selectedEntryId:20}:p),null),{winner:20,randomVote:null});
});
test('editing a tied matchup preserves its random draw',()=>{
  assert.deepEqual(correctedWinner(match,people,null,()=>{throw new Error('Should not redraw');}),{winner:10,randomVote:10});
  assert.deepEqual(correctedWinner({...match,randomVote:null},people,null,()=>1),{winner:20,randomVote:20});
});
test('open matchups save ballots without deciding a winner prematurely',()=>{
  assert.deepEqual(correctedWinner({...match,isClosed:0,winnerEntryId:null,randomVote:null},[people[0]],null),{winner:null,randomVote:null});
});
test('finale corrections retain manual tie selection regardless of bracket policy',()=>{
  assert.deepEqual(correctedWinner({...match,inFinale:1},people,20),{winner:20,randomVote:null});
  assert.deepEqual(correctedWinner({...match,inFinale:1},people,null),{winner:null,randomVote:null});
});
test('ballot edits reject nonparticipants, duplicate users and invalid songs',()=>{
  validateBallotEdits([{userId:3,selectedEntryId:20}],people,match);
  validateBallotEdits([{userId:1,selectedEntryId:null}],people,match);
  for(const ballots of [[{userId:99,selectedEntryId:10}],[{userId:1,selectedEntryId:99}],[{userId:1,selectedEntryId:10},{userId:1,selectedEntryId:20}],[]]) assert.throws(()=>validateBallotEdits(ballots,people,match));
});
test('revision changes when ballots or matchup options change',()=>{
  const revision=ballotRevision(match,people);
  assert.notEqual(revision,ballotRevision({...match,songBEntryId:30},people));
  assert.notEqual(revision,ballotRevision(match,people.map(p=>({...p,selectedEntryId:10}))));
});

test('only the current and immediately previous round allow ballot edits',()=>{
  assert.equal(roundAllowsBallotEditing(1,3),false); // Sweet 16 during Final Four
  assert.equal(roundAllowsBallotEditing(2,3),true); // Elite 8
  assert.equal(roundAllowsBallotEditing(3,3),true); // Final Four
  assert.equal(roundAllowsBallotEditing(4,3),false); // Future championship
  assert.equal(roundAllowsBallotEditing(1,1),true);
});

test('finale Random choice selects either song and records a tiebreaker vote',()=>{
  const finale={...match,inFinale:1,randomVote:null};
  assert.deepEqual(correctedWinner(finale,people,'random',()=>0),{winner:10,randomVote:10});
  assert.deepEqual(correctedWinner(finale,people,'random',()=>1),{winner:20,randomVote:20});
});
test('finale Random choice does not override a majority or reroll an existing draw',()=>{
  assert.deepEqual(correctedWinner({...match,inFinale:1},people,'random',()=>{throw new Error('Unexpected redraw');}),{winner:10,randomVote:10});
  assert.deepEqual(correctedWinner({...match,inFinale:1},people.map(p=>({...p,selectedEntryId:20})),'random'),{winner:20,randomVote:null});
});

test('zero-vote corrections retain a saved random draw and finale can resolve zero votes',()=>{
  const empty=people.map(p=>({...p,selectedEntryId:null}));
  assert.deepEqual(correctedWinner(match,empty,null,()=>{throw new Error('Unexpected redraw');}),{winner:10,randomVote:10});
  assert.deepEqual(correctedWinner({...match,inFinale:1,randomVote:null},empty,'random',()=>1),{winner:20,randomVote:20});
});

test('finale supports higher- and lower-seed tiebreakers without overriding a majority',()=>{
  const finale={...match,inFinale:1,seedingSize:4,randomVote:null};
  assert.deepEqual(correctedWinner(finale,people,'seed'),{winner:10,randomVote:null});
  assert.deepEqual(correctedWinner(finale,people,'seed_low'),{winner:20,randomVote:null});
  assert.deepEqual(correctedWinner(finale,people.map(person=>({...person,selectedEntryId:10})),'seed_low'),{winner:10,randomVote:null});
});

test('saved admin tiebreaker contributes one extra vote to an even tally',()=>{
  const adminMatch={...match,tiebreakerOption:'admin_pick',randomVote:null,tieBreakEntryId:20};
  assert.deepEqual(correctedWinner(adminMatch,people,null),{winner:20,randomVote:20});
  assert.deepEqual(correctedWinner(adminMatch,people,10),{winner:10,randomVote:10});
});
test('saved admin tiebreaker does not override a majority or close an open matchup',()=>{
  const adminMatch={...match,tiebreakerOption:'admin_pick',randomVote:null,tieBreakEntryId:20};
  assert.deepEqual(correctedWinner(adminMatch,people.map(p=>({...p,selectedEntryId:10})),20),{winner:10,randomVote:null});
  assert.deepEqual(correctedWinner({...adminMatch,isClosed:0,winnerEntryId:null},people,20),{winner:null,randomVote:null});
});
test('revision changes when the saved admin tiebreaker changes',()=>{
  assert.notEqual(ballotRevision({...match,tieBreakEntryId:10},people),ballotRevision({...match,tieBreakEntryId:20},people));
});

test('finale can use the configured admin vote to break a tie',()=>{
  const finale={...match,inFinale:1,tiebreakerOption:'admin_pick',randomVote:null};
  assert.deepEqual(correctedWinner(finale,people,'admin_vote'),{winner:10,randomVote:10});
  assert.deepEqual(correctedWinner(finale,people.map(p=>({...p,selectedEntryId:20})),'admin_vote'),{winner:20,randomVote:null});
  assert.deepEqual(correctedWinner(finale,people.filter(p=>p.role!=='owner').concat({userId:4,role:'member',selectedEntryId:10}),'admin_vote'),{winner:null,randomVote:null});
});
