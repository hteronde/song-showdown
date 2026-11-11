import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeBracket, authorizeBracketRequest } from './bracket-access.mjs';

// Two families, each with an owner, a participant and a nonparticipant.
const users = new Map([[1,{family:10,user_role:'super'}],[2,{family:10,user_role:'viewer'}],[3,{family:10,user_role:'viewer'}],[4,{family:20,user_role:'super'}],[5,{family:20,user_role:'viewer'}],[6,{family:null,user_role:'super'}]]);
const brackets = new Map([[100,{family:10,participants:[2]}],[200,{family:20,participants:[5]}]]);
function database() {
  const calls=[];
  return { calls, async execute(sql, args) {
    calls.push({sql,args});
    if (sql.startsWith('SELECT bracket_id AS bracketId FROM matchups')) return [args[0]===1000 ? [{bracketId:100}] : []];
    assert.match(sql,/JOIN users u ON u.family_id=b.family_id/);
    assert.match(sql,/bm.family_id=b.family_id/);
    const bracket=brackets.get(args[0]),user=users.get(args[1]);
    if (!bracket || !user || user.family!==bracket.family) return [[]];
    return [[{bracketId:args[0],familyId:bracket.family,user_role:user.user_role,isParticipant:bracket.participants.includes(args[1])?1:0}]];
  }};
}
test('owners can manage only their own family; members need participation for reads',async()=>{
  assert.equal((await authorizeBracket(database(),1,100,{manageOnly:true})).familyId,10);
  assert.equal((await authorizeBracket(database(),4,200,{manageOnly:true})).familyId,20);
  await authorizeBracket(database(),2,100);
  for(const [user,bracket,manageOnly] of [[1,200,false],[4,100,false],[4,100,true],[2,200,false],[5,100,false],[3,100,false],[2,100,true],[6,100,false]]) {
    await assert.rejects(authorizeBracket(database(),user,bracket,{manageOnly}),{status:404});
  }
});
test('all bracket read routes enforce the same family and participation checks',async()=>{
  for(const suffix of ['', '/voting','/finale-options']) {
    await authorizeBracketRequest(database(),2,'GET',`/api/brackets/100${suffix}`);
    await assert.rejects(authorizeBracketRequest(database(),4,'GET',`/api/brackets/100${suffix}`),{status:404});
    await assert.rejects(authorizeBracketRequest(database(),5,'GET',`/api/brackets/100${suffix}`),{status:404});
  }
});
test('finale writes and admin ballot routes require an owner in the same family',async()=>{
  for(const suffix of ['/finale','/finale/votes','/finale/participants','/finale/mode']) {
    await authorizeBracketRequest(database(),1,'POST',`/api/brackets/100${suffix}`);
    await assert.rejects(authorizeBracketRequest(database(),4,'POST',`/api/brackets/100${suffix}`),{status:404});
    await assert.rejects(authorizeBracketRequest(database(),2,'POST',`/api/brackets/100${suffix}`),{status:404});
  }
  await assert.rejects(authorizeBracketRequest(database(),4,'PUT','/api/admin/brackets/100/matchups/1/ballots'),{status:404});
  await assert.rejects(authorizeBracketRequest(database(),2,'GET','/api/admin/brackets/100'),{status:404});
});
test('matchup vote routes resolve and authorize the bracket before dispatch',async()=>{
  await authorizeBracketRequest(database(),2,'POST','/api/matchups/1000/votes');
  await assert.rejects(authorizeBracketRequest(database(),4,'POST','/api/matchups/1000/votes'),{status:404});
  await assert.rejects(authorizeBracketRequest(database(),2,'POST','/api/matchups/9999/votes'),{status:404});
});
test('missing brackets and detached accounts fail closed; non-bracket routes are unaffected',async()=>{
  await assert.rejects(authorizeBracket(database(),1,999),{status:404});
  await assert.rejects(authorizeBracket(database(),1,NaN),{status:404});
  const c=database();
  await authorizeBracketRequest(c,1,'GET','/api/my/brackets');
  assert.equal(c.calls.length,0);
});
