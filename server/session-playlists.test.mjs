import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSessionPlaylists,saveSessionPlaylists,updateBracketSessionPlaylists} from './session-playlists.mjs';
test('playlist validation accepts shared weeks and an entire-bracket playlist',()=>{
 const list=validateSessionPlaylists([
  {weekNumber:1,playlistName:' ',playlistUrl:' https://example.com/list '},
  {weekNumber:1,playlistUrl:'https://example.com/another'},
  {weekNumber:null,playlistUrl:'https://example.com/all'}
 ]);
 assert.deepEqual(list.map(row=>row.playlistName),['Week 1 playlist','Week 1 playlist','Bracket playlist']);
 assert.equal(list[0].playlistUrl,'https://example.com/list');
 for(const input of [[{weekNumber:1,playlistUrl:'javascript:alert(1)'}],[{weekNumber:0,playlistUrl:''}],{},[{weekNumber:1,playlistUrl:'https://example.com/'+ 'a'.repeat(2048)}]])assert.throws(()=>validateSessionPlaylists(input),{status:400});
});

test('playlist saves keep unchanged links, remove omitted links, and write each new assignment',async()=>{
 const writes=[];
 const c={async execute(sql,args){
  if(sql.startsWith('SELECT week_id'))return [[{week_id:9,week_number:2}]];
  if(sql.startsWith('SELECT playlist_id'))return [[
   {playlist_id:1,week_id:9,playlist_name:'Listen',playlist_url:'https://example.com/list'},
   {playlist_id:2,week_id:9,playlist_name:'Remove me',playlist_url:'https://example.com/remove'}
  ]];
  writes.push(args);
  return [{}];
 }};
 await saveSessionPlaylists(c,5,[
  {weekNumber:2,playlistName:'Listen',playlistUrl:'https://example.com/list'},
  {weekNumber:2,playlistUrl:'https://example.com/shared'},
  {weekNumber:null,playlistUrl:'https://example.com/all'}
 ]);
 assert.deepEqual(writes,[
  [5,9,'Week 2 playlist','https://example.com/shared'],
  [5,null,'Bracket playlist','https://example.com/all'],
  [5,2]
 ]);
 writes.length=0;
 await saveSessionPlaylists(c,5,[]);
 assert.deepEqual(writes,[[5,1],[5,2]]);
 writes.length=0;
 await assert.rejects(saveSessionPlaylists(c,5,[{weekNumber:3,playlistUrl:'https://example.com'}]),{status:400});
 assert.deepEqual(writes,[]);
});

test('direct playlist saves enforce bracket family ownership before writes',async()=>{
 const calls=[];const c={async execute(sql,args){calls.push({sql,args});return [[]];}};
 await assert.rejects(updateBracketSessionPlaylists(c,5,7,[]),{status:404});
 assert.equal(calls.length,1);assert.deepEqual(calls[0].args,[5,7]);
});
