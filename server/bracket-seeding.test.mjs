import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSeedingSize,validateAssignedSeeds,seededOrder} from './bracket-seeding.mjs';
import {canPreserveBracketStructure} from './live-bracket-edit.mjs';
test('seed ranges follow bracket size and seeding can be disabled',()=>{
 assert.equal(parseSeedingSize(null,16),null);
 for(const count of [4,8,16,32,64,128])for(const size of [4,8,16,32,64,128]) {
  if(size<=count)assert.equal(parseSeedingSize(size,count),size);else assert.throws(()=>parseSeedingSize(size,count));
 }
 for(const size of [0,1,3,5,12,4.5,'4',true])assert.throws(()=>parseSeedingSize(size,16));
});
test('16 songs with range 4 require four songs at each seed',()=>{
 const songs=Array.from({length:16},(_,i)=>({assignedSeed:Math.floor(i/4)+1}));
 validateAssignedSeeds(songs,4);
 assert.throws(()=>validateAssignedSeeds(songs.map((song,i)=>i===0?{assignedSeed:2}:song),4),/Seed 1 needs exactly 4 songs/);
 for(const value of [null,0,5,1.5,'1'])assert.throws(()=>validateAssignedSeeds(songs.map((song,i)=>i===0?{assignedSeed:value}:song),4),/Assign every song/);
 assert.throws(()=>validateAssignedSeeds(songs.slice(1),4,16),/all 16 songs/);
 validateAssignedSeeds([{}],null);
});
test('all field sizes distribute repeated top seeds apart and pair high against low',()=>{
 for(const count of [4,8,16,32,64,128])for(const size of [4,8,16,32,64,128].filter(size=>size<=count)) {
  const quota=count/size;
  const songs=Array.from({length:count},(_,i)=>({id:i,assignedSeed:Math.floor(i/quota)+1}));
  const before=structuredClone(songs);
  validateAssignedSeeds(songs,size);
  const order=seededOrder(songs,song=>song.assignedSeed);
  assert.equal(new Set(order.map(song=>song.id)).size,count);
  assert.deepEqual(songs,before);
  for(let i=0;i<count;i+=2)assert.equal(order[i].assignedSeed+order[i+1].assignedSeed,size+1);
  for(let offset=0;offset<count;offset+=size)assert.equal(order.slice(offset,offset+size).filter(song=>song.assignedSeed===1).length,1);
 }
});
test('randomization varies equal-seed songs while maintaining seeded placement',()=>{
 const songs=Array.from({length:16},(_,i)=>({id:i,assignedSeed:Math.floor(i/4)+1}));
 const stable=seededOrder(songs,song=>song.assignedSeed);
 const random=seededOrder(songs,song=>song.assignedSeed,true,items=>[...items].reverse());
 assert.notDeepEqual(random.map(song=>song.id),stable.map(song=>song.id));
 assert.deepEqual(random.map(song=>song.assignedSeed),stable.map(song=>song.assignedSeed));
 // A later round can contain unequal numbers of each surviving seed.
 const winners=[{assignedSeed:1},{assignedSeed:1},{assignedSeed:2},{assignedSeed:4}];
 assert.deepEqual(seededOrder(winners,song=>song.assignedSeed).map(song=>song.assignedSeed),[1,4,1,2]);
});
test('seed configuration or assignment changes require a bracket rebuild',()=>{
 const bracket={start_at:'2026-11-05T12:00:00Z',songs_per_session:2,seeding_size:4};
 const entries=Array.from({length:4},(_,i)=>({bracket_song_id:i+1,assigned_seed:i+1}));
 const input={songCount:4,songsPerSession:2,startAt:bracket.start_at,seedingSize:4,songs:entries.map(entry=>({bracketSongId:entry.bracket_song_id,assignedSeed:entry.assigned_seed}))};
 assert.equal(canPreserveBracketStructure(bracket,entries,input),true);
 assert.equal(canPreserveBracketStructure(bracket,entries,{...input,seedingSize:null}),false);
 assert.equal(canPreserveBracketStructure(bracket,entries,{...input,songs:input.songs.map((song,i)=>({...song,assignedSeed:4-i}))}),false);
});
