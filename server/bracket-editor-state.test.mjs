import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './test-support/frontend-module.mjs';

const settings = await loadFrontendModule(new URL('../src/app/brackets/state/bracket-settings.ts', import.meta.url));
const songs = await loadFrontendModule(new URL('../src/app/brackets/state/song-editing.ts', import.meta.url));
const { ParticipantEditor } = await loadFrontendModule(new URL('../src/app/brackets/state/participant-editor.ts', import.meta.url));
const schedule = await loadFrontendModule(new URL('../src/app/brackets/feature/session-schedule.ts', import.meta.url));
const { VoteDrafts, BracketRequests } = await loadFrontendModule(new URL('../src/app/brackets/state/voting-state.ts', import.meta.url));

test('settings validation preserves required fields and trimmed song counts', () => {
  const valid = {title:'Radiohead',artist:'Radiohead',startAt:'2026-11-07T12:00',participantIds:[1],songList:' A \n\n B\r\nC\nD ',songCount:4};
  assert.deepEqual(settings.validateBracketSettings(valid), {});
  assert.equal(settings.enteredSongCount(valid.songList), 4);
  assert.deepEqual(Object.keys(settings.validateBracketSettings({...valid,title:' ',artist:'',startAt:'',participantIds:[],songList:''})), ['title','artist','startAt','participants','songList']);
});
test('seed validation preserves missing assignment and group capacity errors', () => {
  assert.equal(songs.seedAssignmentError([{assignedSeed:null}],false,4,2),'');
  assert.equal(songs.seedAssignmentError([{assignedSeed:null}],true,4,2),'Assign a seed to every song.');
  assert.equal(songs.seedAssignmentError([1,1,2,2].map(assignedSeed=>({assignedSeed})),true,4,2),'');
  assert.match(songs.seedAssignmentError([1,1,1,2].map(assignedSeed=>({assignedSeed})),true,4,2),/Seed 1 needs exactly 2 songs; currently assigned 3/);
});
test('song reorder protection blocks shifts across locked songs without mutating the original list', () => {
  const list=[{title:'A',reorderLocked:true},{title:'B'},{title:'C'}];
  assert.equal(songs.canReorderSong(list,2,0,false),false);
  assert.equal(songs.canReorderSong(list,1,2,true),false);
  assert.equal(songs.canReorderSong(list,1,2,false),true);
  assert.deepEqual(songs.reorderSong(list,1,2).map(song=>song.title),['A','C','B']);
  assert.deepEqual(list.map(song=>song.title),['A','B','C']);
});
test('seed group filtering uses original indices and searches song metadata', () => {
  const list=[{title:'A',album:'The Bends'},{title:'B',album:'OK Computer'},{title:'C',album:'The Bends'}];
  assert.deepEqual(songs.seedGroupSongs(list,[1,2,1],1,' BENDS ').map(item=>item.index),[0,2]);
  assert.equal(songs.seedGroupSongs(list,[1,2,1],2,'Bends').length,0);
});
const members=[{userId:1,email:'a@example.com'},{userId:2,email:'b@example.com'}];
test('participant editing isolates drafts, deduplicates selection, and toggles select-all', () => {
  const editor=new ParticipantEditor(), selected=[1];
  editor.open(selected,members);editor.toggle(2,true);editor.toggle(2,true);
  assert.deepEqual(editor.ids,[1,2]);assert.deepEqual(selected,[1]);
  assert.equal(editor.allSelected(members),true);
  editor.selectAll(members);assert.deepEqual(editor.ids,[]);
  editor.selectAll(members);assert.deepEqual(editor.ids,[1,2]);
  editor.open(selected,members);assert.equal(editor.allSelected(members),false);
});
test('participant email changes keep previous values and reject invalid drafts', () => {
  const editor=new ParticipantEditor();editor.open([1],members);
  assert.deepEqual(editor.changes(members),[]);
  editor.emails[1]=' changed@example.com ';
  assert.deepEqual(editor.changes(members),[{userId:1,email:'changed@example.com',previousEmail:'a@example.com'}]);
  assert.equal(members[0].email,'a@example.com');
  editor.emails[1]='invalid';assert.equal(editor.changes(members),null);assert.match(editor.error,/valid email/);
  editor.ids=[];assert.equal(editor.changes(members),null);assert.equal(editor.error,'Select at least one participant.');
});
test('session editor payload preserves exact saved timestamps and supports cleared dates', () => {
  const saved=[{weekNumber:1,opensAt:'2026-11-07T10:00:00.000Z',closesAt:'2026-11-08T10:00:00.000Z',isFinale:false}];
  const rows=schedule.sessionEditorRows(saved);
  assert.deepEqual(schedule.sessionSchedulePayload(rows),[{weekNumber:1,opensAt:saved[0].opensAt,closesAt:saved[0].closesAt}]);
  rows[0].endInput='';assert.equal(schedule.sessionSchedulePayload(rows)[0].closesAt,null);
  assert.equal(saved[0].closesAt,'2026-11-08T10:00:00.000Z');
  assert.equal(schedule.durationMinutes(1.5,'hours'),90);
  assert.equal(schedule.durationMinutes(1,'weeks'),10080);
});
test('session preview still produces timed rounds and one combined finale summary', () => {
  const sessions=schedule.previewSessionSchedule({songCount:8,startAt:'2026-11-07T10:00:00Z',matchups:2,minutes:60,finaleRound:2,finaleDate:'2026-11-08'},[],null,new Date('2026-11-06T10:00:00Z'));
  assert.equal(sessions.length,4);assert.equal(sessions[0].closesAt,'2026-11-07T11:00:00.000Z');
  assert.deepEqual(schedule.summarizeFinaleSessions(sessions),{roundRange:'Final Four - Championship',matchupCount:3});
  assert.equal(schedule.summarizeFinaleSessions([]),null);
});
test('voting drafts use saved data until edited and can release server-confirmed edits', () => {
  const drafts=new VoteDrafts(),match={matchupId:1,selectedEntryId:10,comment:'Saved'};
  assert.equal(drafts.selection(match),10);assert.equal(drafts.comment(match),'Saved');
  drafts.select(match,20,false);drafts.editComment(match,'',false);
  assert.equal(drafts.selection(match),20);assert.equal(drafts.comment(match),'');
  drafts.clearSaved({...match,selectedEntryId:20,comment:''});
  assert.deepEqual(drafts.picks,{});assert.deepEqual(drafts.comments,{});
  drafts.select(match,20,false);drafts.clear();assert.deepEqual(drafts.picks,{});
});
test('request state rejects old same-bracket responses and invalidates on disposal', () => {
  const requests=new BracketRequests();
  const a=requests.begin(1);requests.begin(2);const latest=requests.begin(1);
  assert.equal(requests.isCurrent(a,1),false);assert.equal(requests.isCurrent(latest,1),true);
  requests.invalidate();assert.equal(requests.isCurrent(latest,1),false);
});

test('session end edits link following starts and preserve durations in both directions',()=>{
  const rows=[{startInput:'2026-11-12T10:00:00',endInput:'2026-11-12T11:00:00'},
    {startInput:'2026-11-12T11:00:00',endInput:'2026-11-12T12:00:00'},
    {startInput:'2026-11-12T13:00:00',endInput:'2026-11-12T15:00:00'}];
  schedule.updateSessionEnd(rows,0,'2026-11-12T14:00:00');
  assert.equal(rows[1].startInput,rows[0].endInput);
  assert.equal(rows[1].endInput,'2026-11-12T15:00:00');
  assert.equal(rows[2].startInput,rows[1].endInput);
  assert.equal(rows[2].endInput,'2026-11-12T17:00:00');
  schedule.updateSessionEnd(rows,0,'2026-11-12T11:00:00');
  assert.equal(rows[1].endInput,'2026-11-12T12:00:00');
  assert.equal(rows[2].endInput,'2026-11-12T14:00:00');
});
test('linked session edits preserve locked history and finale and handle untimed windows',()=>{
  const past={startInput:'2026-11-12T08:00:00',endInput:'2026-11-12T09:00:00',endLocked:true};
  const finale={startInput:'2026-11-13T18:00:00',endInput:'',isFinale:true};
  const rows=[past,{startInput:'2026-11-12T09:00:00',endInput:'2026-11-12T10:00:00'},{startInput:'',endInput:''},finale];
  schedule.updateSessionEnd(rows,0,'2026-11-12T12:00:00');assert.equal(past.endInput,'2026-11-12T09:00:00');
  schedule.updateSessionEnd(rows,1,'2026-11-12T12:00:00');assert.equal(rows[2].startInput,rows[1].endInput);assert.equal(rows[2].endInput,'');assert.equal(finale.startInput,'2026-11-13T18:00:00');
  schedule.updateSessionEnd(rows,1,'');assert.equal(rows[2].startInput,'');
});
