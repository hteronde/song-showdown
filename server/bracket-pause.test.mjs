import test from 'node:test';
import assert from 'node:assert/strict';
import { setBracketPaused } from './bracket-pause.mjs';
function fake(bracket) {
  const changes=[];
  return { changes,async execute(sql,params) {
    if (sql.startsWith('SELECT')) return [bracket ? [bracket] : []];
    changes.push({sql,params}); return [{affectedRows:1}];
  }};
}
test('pause and resume requests are idempotent',async()=>{
  const paused=fake({canPause:1,pausedAt:new Date()});
  await setBracketPaused(paused,6,1,true);
  assert.equal(paused.changes.length,0);
  const running=fake({canPause:1,pausedAt:null});
  await setBracketPaused(running,6,1,false);
  assert.equal(running.changes.length,0);
});
test('pause records the hold time; resume shifts unfinished sessions before clearing it',async()=>{
  const running=fake({canPause:1,pausedAt:null});
  await setBracketPaused(running,6,1,true);
  assert.equal(running.changes.length,1);
  assert.match(running.changes[0].sql,/paused_at=NOW/);
  const paused=fake({canPause:1,pausedAt:new Date()});
  await setBracketPaused(paused,6,1,false);
  assert.equal(paused.changes.length,2);
  assert.match(paused.changes[0].sql,/closes_at>b.paused_at/);
  assert.match(paused.changes[1].sql,/paused_at=NULL/);
});
test('missing, draft, future, or completed brackets cannot be paused',async()=>{
  await assert.rejects(setBracketPaused(fake(null),6,1,true),{status:404});
  const draft=fake({canPause:0});
  await assert.rejects(setBracketPaused(draft,6,1,true),{status:409});
  assert.equal(draft.changes.length,0);
});
