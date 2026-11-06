import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFinalePlan} from './finale-plan.mjs';
const start='2026-11-04T12:00:00Z';
test('finale scheduling is optional and preserves compatibility with existing clients',()=>{
  assert.equal(parseFinalePlan({},16,start),undefined);
  assert.deepEqual(parseFinalePlan({finaleAt:null,finaleStartRound:null},16,start),{finaleAt:null,finaleStartRound:null});
});
test('a finale plan accepts a date and any available round, including round one',()=>{
  const date='2026-11-10T18:00:00Z';
  assert.equal(parseFinalePlan({finaleAt:date,finaleStartRound:3},16,start).finaleStartRound,3);
  assert.equal(parseFinalePlan({finaleAt:date,finaleStartRound:1},16,start).finaleStartRound,1);
});
test('incomplete, out-of-range and invalid finale plans are rejected',()=>{
  for(const input of [{finaleAt:start},{finaleStartRound:3},{finaleAt:'bad',finaleStartRound:2},{finaleAt:start,finaleStartRound:5},{finaleAt:'2026-11-01',finaleStartRound:2}]) assert.throws(()=>parseFinalePlan(input,16,start),{status:400});
});
test('Finale Date has no time and can be the same day as an evening bracket start',()=>{
  const plan=parseFinalePlan({finaleAt:'2026-11-04',finaleStartRound:2},16,'2026-11-04T19:00:00');
  assert.equal(plan.finaleAt.getFullYear(),2026);assert.equal(plan.finaleAt.getMonth(),10);assert.equal(plan.finaleAt.getDate(),4);assert.equal(plan.finaleAt.getHours(),0);
  assert.throws(()=>parseFinalePlan({finaleAt:'2026-02-30',finaleStartRound:2},16,'2026-02-01'),{status:400});
});
