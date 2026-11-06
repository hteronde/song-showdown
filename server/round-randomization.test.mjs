import test from 'node:test';
import assert from 'node:assert/strict';
import {shuffled,randomizeReadyRounds} from './round-randomization.mjs';
test('shuffle preserves every entrant once without changing the source or attached seed data',()=>{
  const source=[{id:1,seed:8},{id:2,seed:1},{id:3,seed:4},{id:4,seed:2}];
  const result=shuffled(source,()=>0);
  assert.deepEqual(source.map(s=>s.id),[1,2,3,4]);
  assert.deepEqual(result.map(s=>s.id),[2,3,4,1]);
  assert.deepEqual([...result].sort((a,b)=>a.id-b.id),source);
});
test('Round 1 Only never reshuffles advancing rounds',async()=>{
  let queries=0;
  await randomizeReadyRounds({async execute(){queries++;return [[{randomization_mode:'round1'}]];}},1);
  assert.equal(queries,1);
});
test('each-round draw waits for every previous winner',async()=>{
  const queries=[];
  const c={async execute(sql){queries.push(sql);
    if(sql.startsWith('SELECT randomization_mode'))return [[{randomization_mode:'each_round'}]];
    if(sql.startsWith('SELECT round_id'))return [[{round_id:1,round_number:1,randomized_at:new Date()},{round_id:2,round_number:2,randomized_at:null}]];
    if(sql.startsWith('SELECT m.matchup_id,m.winner_entry_id'))return [[{matchup_id:1,winner_entry_id:10},{matchup_id:2,winner_entry_id:null}]];
    throw new Error('Must not draw or change a target round before all winners exist');
  }};
  await randomizeReadyRounds(c,1);
  assert.ok(queries.every(sql=>sql.startsWith('SELECT')));
});
test('saved draws are never rerun on subsequent checks',async()=>{
  const c={async execute(sql){
    if(sql.startsWith('SELECT randomization_mode'))return [[{randomization_mode:'each_round'}]];
    if(sql.startsWith('SELECT round_id'))return [[{round_id:1,round_number:1,randomized_at:new Date()},{round_id:2,round_number:2,randomized_at:new Date()}]];
    throw new Error('A saved draw must not query or rewrite pairings');
  }};
  await randomizeReadyRounds(c,1);
});
