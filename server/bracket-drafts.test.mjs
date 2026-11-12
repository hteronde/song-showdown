import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBracketDraft,restoreBracketDraft,saveBracketDraft,saveDraftSessionSettings} from './bracket-drafts.mjs';
test('drafts require only title and theme, allow unfinished fields, and ignore control fields',()=>{
 assert.deepEqual(prepareBracketDraft({title:'  A bracket ',artist:' Rock ',status:'complete',familyId:9,songCount:32,songs:[],participantIds:[],startAt:null,finaleAt:'2027-01-01',finaleStartRound:null,seedingSize:8}),{title:'A bracket',artist:'Rock',settings:{songCount:32,songs:[],participantIds:[],startAt:null,finaleAt:'2027-01-01',finaleStartRound:null,seedingSize:8}});
 for(const input of [null,{},[],{title:'A',artist:''},{title:'',artist:'B'},{title:'a'.repeat(161),artist:'B'}])assert.throws(()=>prepareBracketDraft(input));
});
test('draft restoration keeps the latest song metadata while recovering unfinished seeds',()=>{
 const songs=[{bracketSongId:1,title:'Renamed song',assignedSeed:1},{bracketSongId:3,title:'New song',assignedSeed:null}];
 const row={status:'draft',draftSettings:JSON.stringify({songCount:32,startAt:null,songs:[{bracketSongId:1,title:'Old title',assignedSeed:null},{bracketSongId:2,title:'Removed song',assignedSeed:2}]})};
 assert.deepEqual(restoreBracketDraft(row,songs),{settings:{songCount:32,startAt:null},songs:[{...songs[0],assignedSeed:null},songs[1]]});
 assert.deepEqual(restoreBracketDraft({...row,status:'active'},songs),{settings:{},songs});
});
test('draft creation stores form settings without creating a schedule or participants',async()=>{
 const calls=[];const c={async execute(sql,args){calls.push({sql,args});return [{insertId:5}];}};
 assert.deepEqual(await saveBracketDraft(c,{familyId:1,userId:2,input:{title:'A',artist:'B'}}),{bracketId:5,saved:true,status:'draft'});
 assert.equal(calls.length,1);assert.match(calls[0].sql,/INSERT INTO brackets/);assert.deepEqual(calls[0].args,[1,2,'A','B','{}']);
});
test('active, completed, out-of-family, and historical brackets cannot be drafted',async()=>{
 for(const row of [null,{hasStarted:1,status:'active'},{hasStarted:0,status:'complete'},{hasStarted:0,status:'draft',completed_at:new Date()},{hasStarted:0,status:'draft',activity:1}]) {
  const calls=[];const c={async execute(sql){calls.push(sql);if(sql.startsWith('SELECT bracket_id'))return [row?[row]:[]];if(sql.includes('AS total'))return [[{total:row.activity}]];throw new Error('Unexpected write');}};
  await assert.rejects(saveBracketDraft(c,{bracketId:5,familyId:1,userId:2,input:{title:'A',artist:'B'}}));assert.ok(calls.every(sql=>sql.startsWith('SELECT')));
 }
});

test('saving draft sessions preserves unrelated draft settings and does not activate the bracket',async()=>{
 const calls=[];const c={async execute(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT title,artist'))return [[{title:'Original title',artist:'Rock',status:'draft',draft_settings:JSON.stringify({anonymous:true,participantIds:[4],participantRoles:{4:'commissioner'},seedingSize:4})}]];if(sql.startsWith('SELECT bracket_id,status'))return [[{status:'draft',hasStarted:0,completed_at:null}]];if(sql.includes('AS total'))return [[{total:0}]];if(sql.startsWith('UPDATE brackets'))return [{affectedRows:1}];throw new Error('Unexpected query');}};
 const result=await saveDraftSessionSettings(c,{bracketId:15,familyId:1,userId:2,input:{title:'Do not overwrite',participantIds:[99],sessionDurationMinutes:6,startAt:'2026-11-06T12:00:00Z',sessionSchedule:[{weekNumber:1,opensAt:'2026-11-06T12:00:00Z',closesAt:'2026-11-06T12:06:00Z'}]}});
 assert.equal(result.status,'draft');const update=calls.find(call=>call.sql.startsWith('UPDATE brackets'));assert.equal(update.args[0],'Original title');assert.equal(update.args[1],'Rock');const saved=JSON.parse(update.args[2]);assert.equal(saved.sessionDurationMinutes,6);assert.equal(saved.anonymous,true);assert.deepEqual(saved.participantIds,[4]);assert.equal(saved.seedingSize,4);assert.equal(saved.sessionSchedule.length,1);assert.match(update.sql,/status='draft',start_at=NULL/);
});
test('draft session setup cannot modify active or out-of-family brackets',async()=>{
 for(const row of [null,{title:'A',artist:'B',status:'active'}]) {
  const calls=[];const c={async execute(sql,args){calls.push({sql,args});return [row?[row]:[]];}};
  await assert.rejects(saveDraftSessionSettings(c,{bracketId:15,familyId:99,userId:2,input:{sessionDurationMinutes:6}}),error=>[404,409].includes(error.status));assert.equal(calls.length,1);assert.deepEqual(calls[0].args,[15,99]);
 }
});
