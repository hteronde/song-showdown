// User-confirmed correction: revise totals, preserve all historical winners.
import mysql from 'mysql2/promise';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const sourceUrl=new URL('../database/beatles_round32_votes.json',import.meta.url);
const data=JSON.parse(await readFile(sourceUrl,'utf8'));
const desired=[['Blackbird','Ticket to Ride'],['Revolution 1','Help!'],['Oh! Darling','Here, There and Everywhere'],['Strawberry Fields Forever','Strawberry Fields Forever'],['Here Comes the Sun','Here Comes the Sun'],['Back in the U.S.S.R.','Back in the U.S.S.R.'],['Something','Abbey Road Medley 1'],['If I Fell','Yesterday']];
const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||8889),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'music_bracket'});
try {
  await c.beginTransaction();
  const [[bracket]]=await c.execute('SELECT * FROM brackets WHERE bracket_id=1 AND title=? FOR UPDATE',['Beatles Bracket']);
  assert.ok(bracket);assert.equal(bracket.status,'complete');
  const [before]=await c.execute('SELECT matchup_id,winner_entry_id,song_a_entry_id,song_b_entry_id,random_tiebreaker_vote_entry_id FROM matchups WHERE bracket_id=1 ORDER BY matchup_id FOR UPDATE');
  const [users]=await c.execute('SELECT u.user_id FROM users u JOIN bracket_members bm ON bm.user_id=u.user_id WHERE bm.bracket_id=1 AND u.display_name=?',['Dave']);assert.equal(users.length,1);
  const dave=users[0].user_id;
  let added=0,corrected=0;const summary=[];
  for(const [firstSong,choice] of desired) {
    const source=data.matchups.find(row=>row.songA===firstSong);assert.ok(source);assert.ok([source.songA,source.songB].includes(choice));
    const [rows]=await c.execute(`SELECT m.matchup_id,m.song_a_entry_id,m.song_b_entry_id,t.votes_a,t.votes_b,v.selected_entry_id
      FROM matchups m JOIN bracket_weeks w ON w.bracket_id=m.bracket_id AND w.week_id=m.week_id JOIN bracket_rounds r ON r.bracket_id=m.bracket_id AND r.round_id=w.round_id
      JOIN bracket_songs a ON a.bracket_song_id=m.song_a_entry_id JOIN songs sa ON sa.song_id=a.song_id JOIN bracket_songs b ON b.bracket_song_id=m.song_b_entry_id JOIN songs sb ON sb.song_id=b.song_id
      JOIN matchup_reported_totals t ON t.bracket_id=m.bracket_id AND t.matchup_id=m.matchup_id LEFT JOIN votes v ON v.bracket_id=m.bracket_id AND v.matchup_id=m.matchup_id AND v.user_id=?
      WHERE m.bracket_id=1 AND r.round_number=2 AND sa.title=? AND sb.title=? FOR UPDATE`,[dave,source.songA,source.songB]);
    assert.equal(rows.length,1);const row=rows[0];
    const entryFor=title=>title===source.songA?Number(row.song_a_entry_id):Number(row.song_b_entry_id);
    const previous=source.votes.Dave??null,selected=entryFor(choice);
    assert.equal(row.selected_entry_id==null?null:Number(row.selected_entry_id),previous===null?null:entryFor(previous),'Dave’s existing vote changed unexpectedly.');
    assert.equal(Number(row.votes_a),source.reportedVotesA);assert.equal(Number(row.votes_b),source.reportedVotesB);
    if(previous!==choice) {
      if(previous===source.songA)source.reportedVotesA--;else if(previous===source.songB)source.reportedVotesB--;
      if(choice===source.songA)source.reportedVotesA++;else source.reportedVotesB++;
      if(previous===null)added++;else corrected++;
      await c.execute('INSERT INTO votes (bracket_id,matchup_id,user_id,selected_entry_id,submitted_at) VALUES (1,?,?,?,NOW()) ON DUPLICATE KEY UPDATE selected_entry_id=VALUES(selected_entry_id),submitted_at=NOW()',[row.matchup_id,dave,selected]);
      await c.execute('UPDATE matchup_reported_totals SET votes_a=?,votes_b=?,source_note=? WHERE bracket_id=1 AND matchup_id=?',[source.reportedVotesA,source.reportedVotesB,'Totals revised per newly recovered Dave votes. User explicitly confirmed historical winners remain authoritative, including outcomes that differ from recovered tallies.',row.matchup_id]);
      source.votes.Dave=choice;
    }
    summary.push({matchup:source.songA+' vs '+source.songB,totals:[source.reportedVotesA,source.reportedVotesB]});
  }
  const [after]=await c.execute('SELECT matchup_id,winner_entry_id,song_a_entry_id,song_b_entry_id,random_tiebreaker_vote_entry_id FROM matchups WHERE bracket_id=1 ORDER BY matchup_id');assert.deepEqual(after,before);
  const note='User correction 2026-11-04 (latest): change Dave from Revolution 1 to Help! and from Oh! Darling to Here, There and Everywhere. Revise the totals and preserve every recorded winner.';
  if(!data.notes.includes(note))data.notes.push(note);
  await c.commit();
  await writeFile(sourceUrl,JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify({addedVotes:added,correctedVotes:corrected,winnersPreserved:after.length,summary}));
} catch(error){await c.rollback();throw error;}finally{await c.end();}
