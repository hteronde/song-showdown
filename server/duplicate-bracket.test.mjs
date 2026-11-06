import test from 'node:test';import assert from 'node:assert/strict';import {duplicateBracket,duplicateBracketTitle} from './duplicate-bracket.mjs';
test('duplicate titles append copy and fit the database title limit',()=>{
 assert.equal(duplicateBracketTitle('Radiohead Bracket'),'Radiohead Bracket copy');
 assert.equal(Array.from(duplicateBracketTitle('a'.repeat(160))).length,160);
 assert.equal(duplicateBracketTitle('🎵'.repeat(160)).endsWith(' copy'),true);
 assert.equal(Array.from(duplicateBracketTitle('🎵'.repeat(160))).length,160);
});
test('duplication checks family ownership before copying anything',async()=>{
 const calls=[];const c={async execute(sql,args){calls.push({sql,args});return [[]];}};
 await assert.rejects(duplicateBracket(c,{bracketId:15,familyId:99,userId:1}),{status:404});assert.equal(calls.length,1);assert.deepEqual(calls[0].args,[15,99]);assert.match(calls[0].sql,/family_id=\?/);
});

test('duplicates always start without participants or voting history, including draft overrides',async()=>{
 const calls=[];const source={title:'Source',artist:'Rock',status:'draft',draft_settings:JSON.stringify({participantIds:[12],songCount:32}),songs_per_session:2,session_duration_minutes:60,randomization_mode:'none',tiebreaker_option:'random'};
 const c={async execute(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT * FROM brackets'))return [[source]];if(sql.startsWith('SELECT MAX'))return [[{roundCount:null}]];if(sql.startsWith('SELECT'))return [[]];if(sql.startsWith('INSERT INTO brackets'))return [{insertId:6}];if(sql.startsWith('UPDATE brackets SET draft_settings'))return [{affectedRows:1}];throw new Error('Unexpected write');}};
 const result=await duplicateBracket(c,{bracketId:5,familyId:1,userId:2,input:{participantIds:[99]}});
 assert.equal(result.bracketId,6);const stored=JSON.parse(calls.find(call=>call.sql.startsWith('UPDATE brackets SET draft_settings')).args[0]);assert.deepEqual(stored.participantIds,[]);
 assert.ok(!calls.some(call=>/bracket_members|FROM votes|INTO votes|INTO matchups|INTO bracket_finale_sessions/.test(call.sql)));
 assert.equal(source.draft_settings,JSON.stringify({participantIds:[12],songCount:32}));
});
