import test from 'node:test';
import assert from 'node:assert/strict';
import { canPreserveBracketStructure,shiftRemainingSessions } from './live-bracket-edit.mjs';
const bracket={start_at:'2026-11-04T12:00:00Z',songs_per_session:2};
const entries=[{bracket_song_id:1,title:'One'},{bracket_song_id:2,title:'Two'}];
const input={songCount:2,songsPerSession:2,startAt:bracket.start_at,songs:[{bracketSongId:1},{bracketSongId:2}],titles:['One','Two']};
test('active setting changes preserve structure; field, grouping or start changes require rebuild',()=>{
  assert.equal(canPreserveBracketStructure(bracket,entries,{...input,title:'New title',tiebreakerOption:'random',sessionDurationMinutes:10}),true);
  for(const change of [{songCount:4},{songsPerSession:4},{startAt:'2026-11-05T12:00:00Z'},{songs:[{bracketSongId:2},{bracketSongId:1}]}]) assert.equal(canPreserveBracketStructure(bracket,entries,{...input,...change}),false);
});
test('duration edits preserve elapsed time and shift future sessions, leaving closed sessions alone',()=>{
  const now=new Date('2026-11-04T12:02:00Z');
  const updates=shiftRemainingSessions([
    {week_id:1,opens_at:'2026-11-04T11:50:00Z',closes_at:'2026-11-04T11:55:00Z'},
    {week_id:2,opens_at:'2026-11-04T12:00:00Z',closes_at:'2026-11-04T12:05:00Z'},
    {week_id:3,opens_at:'2026-11-04T12:07:00Z',closes_at:'2026-11-04T12:12:00Z'}
  ],now,10);
  assert.equal(updates.length,2);
  assert.equal(updates[0].closesAt.toISOString(),'2026-11-04T12:10:00.000Z');
  assert.equal(updates[1].opensAt.toISOString(),'2026-11-04T12:12:00.000Z');
  assert.equal(updates[1].closesAt.toISOString(),'2026-11-04T12:22:00.000Z');
});
