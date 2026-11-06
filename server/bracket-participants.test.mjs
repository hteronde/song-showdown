import test from 'node:test';
import assert from 'node:assert/strict';
import {saveBracketParticipants} from './bracket-participants.mjs';
test('participant saves enforce bracket scope and validate selection before writes',async()=>{
 const calls=[];const c={async execute(sql){calls.push(sql);return [[]];}};
 await assert.rejects(saveBracketParticipants(c,{bracketId:1,familyId:2,userId:3,input:{participantIds:[]}}),{status:400});assert.equal(calls.length,0);
 await assert.rejects(saveBracketParticipants(c,{bracketId:1,familyId:2,userId:3,input:{participantIds:[3]}}),{status:404});assert.equal(calls.length,1);
});
test('participant selections persist without changing votes, matchups, or other bracket settings',async()=>{
 const calls=[];const c={async execute(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT bracket_id'))return [[{bracket_id:1}]];if(sql.startsWith('SELECT user_id'))return [[{user_id:3}]];return [{affectedRows:1}];}};
 const result=await saveBracketParticipants(c,{bracketId:1,familyId:2,userId:3,input:{participantIds:[3],changes:[]}});
 assert.deepEqual(result.participantIds,[3]);assert.ok(calls.some(({sql})=>sql.startsWith('INSERT IGNORE INTO bracket_members')));
 assert.ok(calls.some(({sql,args})=>sql.startsWith('UPDATE brackets SET draft_settings')&&args[0]==='[3]'));
 assert.ok(!calls.some(({sql})=>/votes|matchups|start_at|title=/.test(sql)));
});
