import test from 'node:test';
import assert from 'node:assert/strict';
import { memberMatchupView } from './member-bracket-view.mjs';
const song=id=>({entryId:id,title:`Song ${id}`,album:'Album',year:2000,seed:id,youtubeUrl:`https://youtube.com/${id}`,spotifyUrl:`https://spotify.com/${id}`,albumCoverUrl:'https://example.com/image.jpg'});
const matchup={songA:song(1),songB:song(2),bracketSongATitle:'Song 1',bracketSongBTitle:'Song 2',selectedEntryId:1,comment:'Song 1 is best',winnerEntryId:null,randomTiebreakerVoteEntryId:null,winnerTitle:null,ballots:[]};
const context={isAdmin:false,roundNumber:1,isUpcoming:true,revealedEntries:new Set(),songAPending:false,songBPending:false};
test('upcoming first-round songs contain no identifying information for members',()=>{
  const projected=memberMatchupView(matchup,context);
  assert.equal(projected.bracketSongATitle,'TBD');assert.equal(projected.bracketSongBTitle,'TBD');
  for(const side of ['songA','songB']) for(const [key,value] of Object.entries(projected[side])) assert.equal(value,key==='title'?'TBD':null);
  assert.equal(projected.selectedEntryId,null);assert.equal(projected.comment,null);
});
test('opened first-round matchups remain visible',()=>{
  const projected=memberMatchupView(matchup,{...context,isUpcoming:false,revealedEntries:new Set([1,2])});
  assert.equal(projected.songA.title,'Song 1');assert.equal(projected.songB.youtubeUrl,'https://youtube.com/2');
});
test('later rounds show pending feeders without exposing placeholder song metadata',()=>{
  const pending={...matchup,bracketSongATitle:'Winner of week 1, matchup 1'};
  const projected=memberMatchupView(pending,{...context,roundNumber:2,songAPending:true,revealedEntries:new Set([1,2])});
  assert.equal(projected.bracketSongATitle,'Winner of week 1, matchup 1');assert.equal(projected.songA.entryId,null);
  assert.equal(projected.songB.title,'Song 2');
});
test('unrevealed first-round songs cannot leak through later round anchor slots or winners',()=>{
  const projected=memberMatchupView({...matchup,winnerEntryId:2,winnerTitle:'Song 2',randomTiebreakerVoteEntryId:2,ballots:[{selectedEntryId:2}]},{...context,roundNumber:2});
  assert.equal(projected.bracketSongBTitle,'TBD');assert.equal(projected.songB.spotifyUrl,null);
  assert.equal(projected.winnerEntryId,null);assert.equal(projected.winnerTitle,null);assert.deepEqual(projected.ballots,[]);
});
test('admins retain all song details',()=>assert.equal(memberMatchupView(matchup,{...context,isAdmin:true}),matchup));
