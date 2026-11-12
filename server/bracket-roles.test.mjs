import test from 'node:test';
import assert from 'node:assert/strict';
import {saveBracketRoles} from './bracket-roles.mjs';
const roster=[{userId:1,bracket_role:'commissioner'},{userId:2,bracket_role:'member'}];
test('role validation accounts for selection, existing roles, and omitted role maps',async()=>{
 const writes=[];const c={execute:async(sql,args)=>sql.startsWith('SELECT')?[roster]:(writes.push(args),[{affectedRows:1}])};
 await assert.rejects(saveBracketRoles(c,1,[1,2],{1:'member'},true),{status:400});
 await assert.rejects(saveBracketRoles(c,1,[2],undefined,true),{status:400});
 await assert.rejects(saveBracketRoles(c,1,[],undefined,true),{status:400});
 assert.equal(writes.length,0);
 await saveBracketRoles(c,1,[1,2],undefined,false);
 await saveBracketRoles(c,1,[1,2],{1:'member',2:'commissioner'},true);
 assert.deepEqual(writes,[['member',1,1],['commissioner',1,2]]);
});
test('a commissioner cannot assign a replacement role without Super permission',async()=>{
 const c={execute:async()=>[roster]};
 await assert.rejects(saveBracketRoles(c,1,[1,2],{2:'commissioner'},false),{status:403});
});
