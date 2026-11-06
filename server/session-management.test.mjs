import test from 'node:test';import assert from 'node:assert/strict';
import {validateSessionDates,sessionRevision,saveManagedSessions} from './session-management.mjs';
const sessions=[{weekId:1,weekNumber:1,opensAt:'2026-11-05T10:00:00Z',closesAt:'2026-11-05T11:00:00Z',decidedCount:2},{weekId:2,weekNumber:2,opensAt:'2026-11-05T11:00:00Z',closesAt:'2026-11-05T13:00:00Z',decidedCount:0}];
const dates=sessions.map(({weekId,opensAt,closesAt})=>({weekId,opensAt,closesAt}));const now=new Date('2026-11-05T12:00:00Z');
test('session dates allow adjacent windows and reject invalid dates, order, overlap, and missing sessions',()=>{
 assert.equal(validateSessionDates(dates,sessions,false,now).length,2);
 for(const changes of [dates.slice(1),[dates[0],dates[0]],[dates[0],{...dates[1],opensAt:'invalid'}],[dates[0],{...dates[1],opensAt:null}],[dates[0],{...dates[1],closesAt:null}],[dates[0],{...dates[1],closesAt:'2026-11-05T10:00:00Z'}],[dates[0],{...dates[1],opensAt:'2026-11-05T10:30:00Z'}]])assert.throws(()=>validateSessionDates(changes,sessions,false,now));
});
test('untimed future sessions permit blank starts and ends but an end needs a start',()=>{
 const pending=sessions.map(session=>({...session,decidedCount:0}));
 const values=validateSessionDates([{weekId:1,opensAt:dates[0].opensAt,closesAt:null},{weekId:2,opensAt:null,closesAt:null}],pending,true,now);assert.equal(values[1].opensAt,null);assert.equal(values[1].closesAt,null);
 assert.throws(()=>validateSessionDates([{...dates[0]},{weekId:2,opensAt:null,closesAt:dates[1].closesAt}],pending,true,now),/Set a start date/);
});
test('decided sessions can be corrected historically but cannot be reopened',()=>{
 assert.equal(validateSessionDates([{...dates[0],opensAt:'2026-11-05T09:30:00Z'},dates[1]],sessions,false,now).length,2);
 for(const closesAt of [null,'2026-11-05T12:30:00Z'])assert.throws(()=>validateSessionDates([{...dates[0],closesAt},dates[1]],sessions,true,now),/cannot be reopened/);
});
test('session revision detects schedule and result changes',()=>{
 const revision=sessionRevision(sessions);assert.equal(revision,sessionRevision(structuredClone(sessions)));
 assert.notEqual(revision,sessionRevision(sessions.map((session,i)=>i?{...session,closesAt:null}:session)));
 assert.notEqual(revision,sessionRevision(sessions.map((session,i)=>i?{...session,decidedCount:1}:session)));
});
test('session updates enforce family access before writing',async()=>{
 const calls=[];const c={async execute(sql,args){calls.push({sql,args});return [[]];}};
 await assert.rejects(saveManagedSessions(c,4,9,{sessions:dates,revision:'x'}),{status:404});assert.equal(calls.length,1);assert.deepEqual(calls[0].args,[4,9]);assert.match(calls[0].sql,/family_id=\?/);
});

test('unchanged finale dates do not block editing another session after early completion',()=>{
 const finale={weekId:2,weekNumber:2,opensAt:'2026-11-05T11:00:00Z',closesAt:'2026-11-05T13:00:00Z',decidedCount:1};
 const result=validateSessionDates([{...dates[0],opensAt:'2026-11-05T09:00:00Z'},dates[1]],[sessions[0],finale],false,now);assert.equal(result.length,2);
});

test('online session edits are not constrained by hidden in-person finale windows',()=>{
 const values=[{...dates[0],closesAt:'2026-11-05T11:30:00Z'},dates[1]];
 const rows=[{...sessions[0],decidedCount:0},{...sessions[1],isFinale:true}];
 assert.equal(validateSessionDates(values,rows,false,now).length,2);
});

test('completed brackets reject session-date updates without writes',async()=>{
 const calls=[];const c={async execute(sql){calls.push(sql);if(sql.includes('FROM brackets b'))return [[{bracketId:4,status:'complete',duration:60,startAt:'2026-11-05T10:00:00Z',pausedAt:null,finaleStartRound:null}]];if(sql.includes('FROM bracket_weeks w'))return [sessions];throw new Error('Unexpected write');}};
 await assert.rejects(saveManagedSessions(c,4,9,{revision:sessionRevision(sessions),sessions:dates}),error=>error.status===409&&/complete/.test(error.message));assert.ok(calls.every(sql=>sql.startsWith('SELECT')));
});
