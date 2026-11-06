// User-confirmed policy: totals reflect identified participant votes only; keep recorded winners.
import mysql from 'mysql2/promise';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const sourceUrl=new URL('../database/beatles_round32_votes.json',import.meta.url);
const source=JSON.parse(await readFile(sourceUrl,'utf8'));
const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||8889),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'music_bracket'});
try {
  await c.beginTransaction();
  const [[bracket]]=await c.execute('SELECT * FROM brackets WHERE bracket_id=1 AND title=? FOR UPDATE',['Beatles Bracket']);assert.ok(bracket);
  const [before]=await c.execute('SELECT matchup_id,song_a_entry_id,song_b_entry_id,winner_entry_id,random_tiebreaker_vote_entry_id FROM matchups WHERE bracket_id=1 ORDER BY matchup_id FOR UPDATE');
  const [matches]=await c.execute(`SELECT m.matchup_id AS id,m.song_a_entry_id AS aId,m.song_b_entry_id AS bId,sa.title AS a,sb.title AS b
    FROM matchups m JOIN bracket_weeks w ON w.bracket_id=m.bracket_id AND w.week_id=m.week_id JOIN bracket_rounds r ON r.bracket_id=m.bracket_id AND r.round_id=w.round_id
    JOIN bracket_songs a ON a.bracket_song_id=m.song_a_entry_id JOIN songs sa ON sa.song_id=a.song_id
    JOIN bracket_songs b ON b.bracket_song_id=m.song_b_entry_id JOIN songs sb ON sb.song_id=b.song_id WHERE m.bracket_id=1 AND r.round_number=2`,[]);
  assert.equal(matches.length,16);assert.equal(source.matchups.length,16);
  const [beforeVotes]=await c.execute('SELECT * FROM votes WHERE bracket_id=1 ORDER BY vote_id FOR UPDATE');
  let total=0,changed=0;
  for(const row of source.matchups) {
    const found=matches.filter(match=>match.a===row.songA&&match.b===row.songB);assert.equal(found.length,1);const match=found[0];
    const [votes]=await c.execute('SELECT u.display_name AS name,v.selected_entry_id AS choice FROM votes v JOIN users u ON u.user_id=v.user_id WHERE v.bracket_id=1 AND v.matchup_id=? AND v.submitted_at IS NOT NULL',[match.id]);
    const actual=Object.fromEntries(votes.map(vote=>[vote.name,Number(vote.choice)===Number(match.aId)?row.songA:Number(vote.choice)===Number(match.bId)?row.songB:'INVALID']));
    const sort=object=>Object.entries(object).sort(([a],[b])=>a.localeCompare(b));
    assert.deepEqual(sort(actual),sort(row.votes),`Stored named votes differ from the supplied data for ${row.songA}`);
    const a=votes.filter(vote=>Number(vote.choice)===Number(match.aId)).length;
    const b=votes.filter(vote=>Number(vote.choice)===Number(match.bId)).length;
    if(a!==row.reportedVotesA||b!==row.reportedVotesB) {
      row.previousReportedVotesA??=row.reportedVotesA;row.previousReportedVotesB??=row.reportedVotesB;changed++;
    }
    row.reportedVotesA=a;row.reportedVotesB=b;total+=a+b;
    await c.execute('UPDATE matchup_reported_totals SET votes_a=?,votes_b=?,source_note=? WHERE bracket_id=1 AND matchup_id=?',[a,b,'User instruction 2026-11-04: totals reflect identified participant votes only, including Dave’s corrections. Recorded winners remain authoritative.',match.id]);
  }
  assert.equal(total,176);
  const [after]=await c.execute('SELECT matchup_id,song_a_entry_id,song_b_entry_id,winner_entry_id,random_tiebreaker_vote_entry_id FROM matchups WHERE bracket_id=1 ORDER BY matchup_id');assert.deepEqual(after,before);
  const [afterVotes]=await c.execute('SELECT * FROM votes WHERE bracket_id=1 ORDER BY vote_id');assert.deepEqual(afterVotes,beforeVotes);
  const [[verification]]=await c.execute(`SELECT SUM(t.votes_a+t.votes_b) AS total,COUNT(*) AS matchups FROM matchup_reported_totals t JOIN matchups m ON m.bracket_id=t.bracket_id AND m.matchup_id=t.matchup_id JOIN bracket_weeks w ON w.bracket_id=m.bracket_id AND w.week_id=m.week_id JOIN bracket_rounds r ON r.bracket_id=m.bracket_id AND r.round_id=w.round_id WHERE t.bracket_id=1 AND r.round_number=2`);
  assert.equal(Number(verification.total),176);assert.equal(verification.matchups,16);
  source.totalsPolicy='identified_voters_only';
  source.notes=source.notes.filter(note=>!note.startsWith('Reported totals are complete'));
  const note='Latest user instruction 2026-11-04: adjust every Round of 32 total to reflect only the named votes supplied, including Dave’s latest corrections. Do not count unidentified votes. Preserve all recorded winners.';
  if(!source.notes.includes(note))source.notes.push(note);
  await c.commit();await writeFile(sourceUrl,JSON.stringify(source,null,2)+'\n');
  console.log(JSON.stringify({matchupsVerified:16,totalsChanged:changed,totalNamedVotes:total,unidentifiedVotesIncluded:0,allVotesUnchanged:true,recordedWinnersPreserved:after.length}));
} catch(error) {await c.rollback();throw error;}finally{await c.end();}
