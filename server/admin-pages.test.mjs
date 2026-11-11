import test from 'node:test';
import assert from 'node:assert/strict';
import {memberInput,adminPageRequest} from './admin-pages.mjs';
test('member forms normalize valid input and reject invalid fields',()=>{
 assert.deepEqual(memberInput({displayName:' Test ',email:'TEST@example.com',user_role:'viewer'}),{displayName:'Test',email:'test@example.com',user_role:'viewer'});
 for(const input of [{displayName:'',email:'test@example.com',user_role:'viewer'},{displayName:'Test',email:'bad',user_role:'viewer'},{displayName:'Test',email:'test@example.com',user_role:'admin'}])assert.throws(()=>memberInput(input),{status:400});
});
test('member edit and playlist delete enforce family ownership before mutation',async()=>{
 for(const path of ['/api/family-members/50','/api/playlists/60']){
  const calls=[];const c={async execute(sql,args){calls.push({sql,args});return [[]];}};
  await assert.rejects(adminPageRequest(c,{path,method:'DELETE',input:{},familyId:7,userId:1}),{status:404});
  assert.equal(calls.length,1);assert.deepEqual(calls[0].args,[path.includes('members')?50:60,7]);assert.ok(calls[0].sql.startsWith('SELECT'));
 }
});
test('member removal cannot detach the signed-in owner',async()=>{
 const c={async execute(sql){if(sql.startsWith('SELECT'))return [[{user_id:1,user_role:'super'}]];throw new Error('Unexpected write');}};
 await assert.rejects(adminPageRequest(c,{path:'/api/family-members/1',method:'DELETE',familyId:7,userId:1}),{status:400});
});
test('playlist creation rejects sessions from another bracket before writes',async()=>{
 const c={async execute(sql){if(sql.startsWith('SELECT bracket_id'))return [[{bracket_id:2}]];if(sql.startsWith('SELECT week_id'))return [[]];throw new Error('Unexpected write');}};
 await assert.rejects(adminPageRequest(c,{path:'/api/playlists',method:'POST',familyId:7,userId:1,input:{bracketId:2,weekId:99,playlistName:'List',playlistUrl:'https://example.com/list'}}),{status:400});
});
