import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAlbum,resolveSongAlbums,removeBracketAlbum} from './bracket-albums.mjs';
test('album validation accepts optional fields and rejects malformed titles, years and links',()=>{
  assert.deepEqual(validateAlbum({title:' Album ',year:1999,albumCoverUrl:'https://example.com/cover.jpg'}),{title:'Album',year:1999,albumCoverUrl:'https://example.com/cover.jpg'});
  assert.deepEqual(validateAlbum({title:'Album'}),{title:'Album',year:null,albumCoverUrl:null});
  for(const album of [{title:''},{title:'Album',year:1.5},{title:'Album',albumCoverUrl:'javascript:alert(1)'}]) assert.throws(()=>validateAlbum(album));
});
test('songs inherit canonical album fields and cannot forge their own copies',async()=>{
  const c={async execute(sql,params){assert.deepEqual(params,[6]);return [[{albumId:10,title:'Shared album',year:1999,albumCoverUrl:'https://example.com/cover.jpg'}]];}};
  const [song]=await resolveSongAlbums(c,6,[{title:'Song',albumId:10,album:'Forged',year:2026,albumCoverUrl:'https://example.com/wrong.jpg'}]);
  assert.equal(song.album,'Shared album');assert.equal(song.year,1999);assert.equal(song.albumCoverUrl,'https://example.com/cover.jpg');
});
test('albums from other brackets are rejected and No album clears inherited fields',async()=>{
  const c={async execute(){return [[]];}};
  await assert.rejects(resolveSongAlbums(c,6,[{albumId:99,title:'Song'}]),{status:400});
  const [song]=await resolveSongAlbums(c,6,[{albumId:null,title:'Song',album:'Old',year:1999,albumCoverUrl:'https://old.example/art.jpg'}]);
  assert.equal(song.album,'');assert.equal(song.year,null);assert.equal(song.albumCoverUrl,'');
});

test('album removal verifies family and album ownership before making changes',async()=>{
 for(const missingBracket of [true,false]) {
  const calls=[];const c={async execute(sql){calls.push(sql);if(sql.startsWith('SELECT bracket_id'))return [missingBracket?[]:[{bracket_id:4}]];if(sql.startsWith('SELECT bracket_album_id'))return [[]];throw new Error('Unexpected write');}};
  await assert.rejects(removeBracketAlbum(c,{bracketId:4,albumId:9,familyId:1}),{status:404});assert.ok(calls.every(sql=>sql.startsWith('SELECT')));
 }
});
test('album removal detaches songs and protects shared catalog data without changing votes',async()=>{
 const calls=[];const c={async execute(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT bracket_id'))return [[{bracket_id:4}]];if(sql.startsWith('SELECT bracket_album_id FROM'))return [[{bracket_album_id:9}]];if(sql.startsWith('SELECT bs.bracket_song_id'))return [[{entryId:10,songId:20,shared:1},{entryId:11,songId:21,shared:0}]];if(sql.startsWith('INSERT INTO songs'))return [{insertId:70}];if(sql.startsWith('SELECT bracket_album_id AS'))return [[]];return [{affectedRows:1}];}};
 const result=await removeBracketAlbum(c,{bracketId:4,albumId:9,familyId:1});assert.deepEqual(result.affectedSongIds,[10,11]);assert.deepEqual(result.albums,[]);
 assert.ok(calls.some(call=>call.sql.startsWith('UPDATE bracket_songs SET song_id')&&JSON.stringify(call.args)==='[70,4,10]'));
 assert.ok(calls.some(call=>call.sql.startsWith('UPDATE songs SET album=NULL')&&call.args[0]===21));assert.ok(!calls.some(call=>call.sql.startsWith('UPDATE songs SET album=NULL')&&call.args[0]===20));
 assert.ok(!calls.some(call=>/votes|matchups|bracket_members/.test(call.sql)));
});
