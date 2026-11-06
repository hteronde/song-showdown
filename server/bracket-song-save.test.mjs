import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBracketSongs, saveBracketSongs } from './bracket-song-save.mjs';

const song = {title:'A song',album:'Album',category:'Rock',year:2001,youtubeUrl:'',spotifyUrl:'',albumCoverUrl:'https://example.com/cover.jpg',seed:null};
test('validates song edits independently of bracket field size and settings', () => {
  assert.deepEqual(validateBracketSongs([]), []);
  assert.deepEqual(validateBracketSongs([song]), [1]);
  for (const invalid of [{...song,title:''},{...song,year:1.5},{...song,seed:'e'},{...song,youtubeUrl:'javascript:alert(1)'},{...song,albumCoverUrl:'javascript:alert(1)'},{...song,albumCoverUrl:'https://example.com/'+'a'.repeat(2048)}]) {
    assert.throws(() => validateBracketSongs([invalid]));
  }
  assert.throws(() => validateBracketSongs([song,{...song,title:' A SONG '}]));
});

test('requires reset confirmation for structural song changes with activity', async () => {
  const calls=[];
  const connection={async execute(sql) {
    calls.push(sql);
    if (sql.startsWith('SELECT * FROM brackets')) return [[{bracket_id:6,artist:'Tool'}]];
    if (sql.includes('AS total')) return [[{total:1}]];
    if (sql.startsWith('SELECT bracket_song_id')) return [[{bracket_song_id:100,song_id:50,seed_number:1}]];
    throw new Error('Unexpected mutation');
  }};
  await assert.rejects(saveBracketSongs(connection,{bracketId:6,familyId:1,userId:1,input:{songs:[song]}}),{status:409,requiresReset:true});
  assert.ok(calls.every(sql=>sql.startsWith('SELECT')));
});

test('edits existing song metadata without rebuilding matchups or saving other settings', async () => {
  const calls=[];
  const connection={async execute(sql,params) {
    calls.push({sql,params});
    if (sql.startsWith('SELECT * FROM brackets')) return [[{bracket_id:6,artist:'Tool',start_at:null,songs_per_session:2}]];
    if (sql.includes('AS total')) return [[{total:0}]];
    if (sql.startsWith('SELECT bracket_song_id')) return [[{bracket_song_id:100,song_id:50,seed_number:1}]];
    if (sql.startsWith('SELECT w.week_id')) return [[{week_id:1,round_number:1},{week_id:2,round_number:2}]];
    if (sql.startsWith('INSERT INTO bracket_songs')) return [{insertId:101}];
    if (sql.startsWith('UPDATE') || sql.startsWith('DELETE')) return [{affectedRows:1}];
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const saved=await saveBracketSongs(connection,{bracketId:6,familyId:1,userId:1,input:{title:'Unsaved title',artist:'Unsaved artist',songs:[{...song,bracketSongId:100}]}});
  assert.equal(saved.bracketId,6);
  assert.equal(saved.needsSetup,false);
  assert.equal(saved.songs[0].bracketSongId,100);
  assert.ok(calls.some(({sql,params})=>sql.startsWith('UPDATE songs') && params.at(-1)===50 && params.at(-2)===song.albumCoverUrl));
  assert.ok(!calls.some(({sql})=> /bracket_members|DELETE FROM|INSERT INTO matchups/.test(sql)));
  assert.ok(!calls.some(({sql})=>sql.startsWith('UPDATE brackets') && /title=|artist=|start_at=/.test(sql)));
});

test('reordering saves explicit positions and retains song-entry IDs', async () => {
  const calls=[];
  const entries=[{bracket_song_id:100,song_id:50,seed_number:1},{bracket_song_id:101,song_id:51,seed_number:2}];
  const connection={async execute(sql,params){
    calls.push({sql,params});
    if(sql.startsWith('SELECT * FROM brackets'))return [[{bracket_id:6,artist:'Tool',start_at:null}]];
    if(sql.includes('AS total'))return [[{total:0}]];
    if(sql.startsWith('SELECT bracket_song_id'))return [entries];
    if(sql.startsWith('SELECT w.week_id'))return [[]];
    if(sql.startsWith('UPDATE')||sql.startsWith('DELETE'))return [{affectedRows:1}];
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const result=await saveBracketSongs(connection,{bracketId:6,familyId:1,userId:1,input:{songs:[{...song,title:'Second',seed:2,bracketSongId:101},{...song,title:'First',seed:1,bracketSongId:100}]}});
  assert.deepEqual(result.songs.map(song=>[song.bracketSongId,song.position]),[[101,1],[100,2]]);
  assert.deepEqual(calls.filter(({sql})=>sql.startsWith('UPDATE bracket_songs SET position')).map(({params})=>params),[[1,6,101],[2,6,100]]);
  assert.ok(!calls.some(({sql})=>sql.startsWith('DELETE FROM bracket_songs')||sql.startsWith('INSERT INTO bracket_songs')));
});
