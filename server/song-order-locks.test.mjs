import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSongOrderUnlocked, getSongOrderLocks } from './song-order-locks.mjs';
import { saveBracketSongs } from './bracket-song-save.mjs';
const existing=[1,2,3,4].map(bracket_song_id=>({bracket_song_id}));
const songs=ids=>ids.map(bracketSongId=>({bracketSongId}));
test('future songs can move while current and past slots stay fixed',()=>{
  assert.doesNotThrow(()=>assertSongOrderUnlocked(existing,songs([1,2,4,3]),new Set([1,2])));
  assert.throws(()=>assertSongOrderUnlocked(existing,songs([3,1,2,4]),new Set([1,2])),{status:409});
  assert.throws(()=>assertSongOrderUnlocked(existing,songs([2,1,3,4]),new Set([1,2])),{status:409});
  assert.doesNotThrow(()=>assertSongOrderUnlocked(existing,songs([4,3,2,1]),new Set()));
});
test('both songs in each protected matchup are locked',async()=>{
  const locked=await getSongOrderLocks({async execute(){return [[{songA:1,songB:2},{songA:2,songB:3}]];}},6);
  assert.deepEqual([...locked],[1,2,3]);
});
test('reset confirmation cannot bypass current matchup order protection',async()=>{
  const calls=[];
  const connection={async execute(sql){
    calls.push(sql);
    if(sql.startsWith('SELECT * FROM brackets'))return [[{bracket_id:6,artist:'Radiohead',start_at:new Date()}]];
    if(sql.includes('AS total'))return [[{total:1}]];
    if(sql.startsWith('SELECT bracket_song_id'))return [[{bracket_song_id:1,seed_number:1},{bracket_song_id:2,seed_number:2}]];
    if(sql.startsWith('SELECT m.song_a_entry_id'))return [[{songA:1,songB:2}]];
    throw new Error('Unexpected mutation');
  }};
  await assert.rejects(saveBracketSongs(connection,{bracketId:6,familyId:1,userId:1,input:{resetHistory:true,songs:[{bracketSongId:2,title:'B',seed:2},{bracketSongId:1,title:'A',seed:1}]}}),{status:409});
  assert.ok(calls.every(sql=>sql.startsWith('SELECT')));
});
