import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNextSessionEnd} from './session-progression.mjs';
import {shiftRemainingSessions} from './live-bracket-edit.mjs';
const now=new Date('2026-11-05T12:00:00Z');
test('manual advancement validates the next end and permits untimed or last sessions',()=>{
 const plan={nextWeekId:2,noTimer:false};
 assert.equal(parseNextSessionEnd({nextClosesAt:'2026-11-05T13:00:00Z'},plan,now).toISOString(),'2026-11-05T13:00:00.000Z');
 for(const end of [null,'','invalid','2026-11-05T11:00:00Z'])assert.throws(()=>parseNextSessionEnd({nextClosesAt:end},plan,now));
 assert.equal(parseNextSessionEnd({}, {...plan,noTimer:true},now),null);
 assert.equal(parseNextSessionEnd({}, {...plan,nextWeekId:null},now),null);
});
test('switching to untimed keeps the current opening but clears current and future deadlines',()=>{
 const weeks=[{week_id:1,opens_at:'2026-11-05T10:00:00Z',closes_at:'2026-11-05T11:00:00Z'},{week_id:2,opens_at:'2026-11-05T11:00:00Z',closes_at:'2026-11-05T13:00:00Z'},{week_id:3,opens_at:'2026-11-05T13:00:00Z',closes_at:'2026-11-05T14:00:00Z'}];
 const changed=shiftRemainingSessions(weeks,now,null);
 assert.equal(changed.length,2);assert.equal(changed[0].opensAt.toISOString(),'2026-11-05T11:00:00.000Z');assert.equal(changed[0].closesAt,null);assert.equal(changed[1].opensAt,null);assert.equal(changed[1].closesAt,null);
});
test('switching untimed sessions to a timer builds contiguous future windows',()=>{
 const weeks=[{week_id:1,opens_at:'2026-11-05T11:50:00Z',closes_at:null},{week_id:2,opens_at:null,closes_at:null},{week_id:3,opens_at:null,closes_at:null}];
 const changed=shiftRemainingSessions(weeks,now,30);
 assert.equal(changed[0].closesAt.toISOString(),'2026-11-05T12:20:00.000Z');assert.equal(changed[1].opensAt.toISOString(),'2026-11-05T12:20:00.000Z');assert.equal(changed[2].closesAt.toISOString(),'2026-11-05T13:20:00.000Z');
});
