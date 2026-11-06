import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSessionPlaylists,saveSessionPlaylists,updateBracketSessionPlaylists} from './session-playlists.mjs';
test('session playlist validation accepts web links and optional names, rejects unsafe URLs and duplicate weeks',()=>{
 assert.deepEqual(validateSessionPlaylists([{weekNumber:1,playlistName:' ',playlistUrl:' https://example.com/list '}]),[{weekNumber:1,playlistName:'Week 1 playlist',playlistUrl:'https://example.com/list'}]);
 for(const input of [[{weekNumber:1,playlistUrl:'javascript:alert(1)'}],[{weekNumber:0,playlistUrl:''}],[{weekNumber:1},{weekNumber:1}],{},[{weekNumber:1,playlistUrl:'https://example.com/'+ 'a'.repeat(2048)}]])assert.throws(()=>validateSessionPlaylists(input),{status:400});
});
test('playlist changes target the matching session and leave bracket-wide playlists alone',async()=>{
 const calls=[];const c={async execute(sql,args){calls.push({sql,args});return sql.startsWith('SELECT')?[[{week_id:9,week_number:2}]]:[{affectedRows:1}];}};
 await saveSessionPlaylists(c,5,[{weekNumber:2,playlistName:'Listen',playlistUrl:'https://example.com/list'}]);
 assert.deepEqual(calls[1].args,[5,9]);assert.deepEqual(calls[2].args,[5,9,'Listen','https://example.com/list']);
});
test('blank playlist URLs remove session assignments and missing sessions fail before writes',async()=>{
 const writes=[];const c={async execute(sql,args){if(sql.startsWith('SELECT'))return [[{week_id:9,week_number:2}]];writes.push(args);return [{}];}};
 await saveSessionPlaylists(c,5,[{weekNumber:2,playlistUrl:''}]);assert.deepEqual(writes,[[5,9]]);
 await assert.rejects(saveSessionPlaylists(c,5,[{weekNumber:3,playlistUrl:'https://example.com'}]),{status:400});
});

test('direct playlist saves enforce bracket family ownership before writes',async()=>{
 const calls=[];const c={async execute(sql,args){calls.push({sql,args});return [[]];}};
 await assert.rejects(updateBracketSessionPlaylists(c,5,7,[]),{status:404});
 assert.equal(calls.length,1);assert.deepEqual(calls[0].args,[5,7]);
});
