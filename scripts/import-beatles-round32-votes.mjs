// Run from the project root with node --env-file=.env scripts/import-beatles-round32-votes.mjs --apply.
// Without --apply, performs the same validation in a transaction and rolls back.
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=JSON.parse(await readFile(new URL('../database/beatles_round32_votes.json',import.meta.url),'utf8'));
const apply=process.argv.includes('--apply');
const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||8889),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'music_bracket'});
try {
  await c.beginTransaction();
  const [brackets]=await c.execute("SELECT * FROM brackets WHERE LOWER(artist) IN ('the beatles','beatles') AND title=? FOR UPDATE",['Beatles Bracket']);
  assert.equal(brackets.length,1,'Expected one Beatles Bracket');
  const bracket=brackets[0];
  assert.equal(bracket.status,'complete','This historical import is only for the completed bracket.');
  const [before]=await c.execute('SELECT matchup_id,song_a_entry_id,song_b_entry_id,winner_entry_id,random_tiebreaker_vote_entry_id FROM matchups WHERE bracket_id=? ORDER BY matchup_id FOR UPDATE',[bracket.bracket_id]);
  const [matches]=await c.execute(`SELECT m.matchup_id AS id,m.song_a_entry_id AS aId,m.song_b_entry_id AS bId,sa.title AS a,sb.title AS b,m.winner_entry_id AS winner
    FROM matchups m JOIN bracket_weeks w ON w.bracket_id=m.bracket_id AND w.week_id=m.week_id
    JOIN bracket_rounds r ON r.bracket_id=m.bracket_id AND r.round_id=w.round_id
    JOIN bracket_songs a ON a.bracket_id=m.bracket_id AND a.bracket_song_id=m.song_a_entry_id JOIN songs sa ON sa.song_id=a.song_id
    JOIN bracket_songs b ON b.bracket_id=m.bracket_id AND b.bracket_song_id=m.song_b_entry_id JOIN songs sb ON sb.song_id=b.song_id
    WHERE m.bracket_id=? AND r.round_number=2 ORDER BY m.matchup_id`,[bracket.bracket_id]);
  assert.equal(matches.length,16);
  const [people]=await c.execute('SELECT u.user_id,u.display_name FROM users u JOIN bracket_members bm ON bm.user_id=u.user_id WHERE bm.bracket_id=? AND u.family_id=?',[bracket.bracket_id,bracket.family_id]);
  const users=new Map();
  for(const name of source.participants) {
    const found=people.filter(person=>person.display_name===name);
    assert.equal(found.length,1,`Expected one assigned participant named ${name}`);
    users.set(name,Number(found[0].user_id));
  }
  let inserted=0,alreadyPresent=0,unknown=0;
  const counts=[];
  for(const row of source.matchups) {
    const found=matches.filter(match=>match.a===row.songA&&match.b===row.songB);
    assert.equal(found.length,1,`Could not uniquely match ${row.songA} vs ${row.songB}`);
    const match=found[0];let a=0,b=0;
    for(const [name,selection] of Object.entries(row.votes)) {
      if(selection===null) {unknown++;continue;}
      assert.ok(users.has(name),'Unknown participant');
      assert.ok(selection===match.a||selection===match.b,'Invalid song choice');
      const entry=Number(selection===match.a?match.aId:match.bId);
      if(selection===match.a) a++;else b++;
      const [existing]=await c.execute('SELECT selected_entry_id,submitted_at FROM votes WHERE bracket_id=? AND matchup_id=? AND user_id=? FOR UPDATE',[bracket.bracket_id,match.id,users.get(name)]);
      if(existing.length) {
        assert.equal(Number(existing[0].selected_entry_id),entry,`Existing vote conflict for ${name}: ${row.songA}`);
        if(!existing[0].submitted_at) await c.execute('UPDATE votes SET submitted_at=NOW() WHERE bracket_id=? AND matchup_id=? AND user_id=?',[bracket.bracket_id,match.id,users.get(name)]);
        alreadyPresent++;
      } else {
        await c.execute('INSERT INTO votes (bracket_id,matchup_id,user_id,selected_entry_id,submitted_at) VALUES (?,?,?,?,NOW())',[bracket.bracket_id,match.id,users.get(name),entry]);
        inserted++;
      }
    }
    assert.ok(a<=row.reportedVotesA&&b<=row.reportedVotesB,'Named votes exceed reported totals.');
    const [reported]=await c.execute('SELECT votes_a,votes_b FROM matchup_reported_totals WHERE bracket_id=? AND matchup_id=?',[bracket.bracket_id,match.id]);
    if(reported.length) {assert.equal(Number(reported[0].votes_a),row.reportedVotesA);assert.equal(Number(reported[0].votes_b),row.reportedVotesB);}
    else await c.execute('INSERT INTO matchup_reported_totals (bracket_id,matchup_id,votes_a,votes_b,source_note) VALUES (?,?,?,?,?)',[bracket.bracket_id,match.id,row.reportedVotesA,row.reportedVotesB,'User-provided historical totals; named voter list is incomplete. Existing winner is authoritative.']);
    counts.push({matchupId:match.id,a,b,partialTallyDisagreesWithWinner:a!==b&&Number(match.winner)!==Number(a>b?match.aId:match.bId)});
  }
  const expectedNamed=source.matchups.reduce((sum,row)=>sum+Object.values(row.votes).filter(Boolean).length,0);
  const reportedTotal=source.matchups.reduce((sum,row)=>sum+row.reportedVotesA+row.reportedVotesB,0);
  assert.equal(inserted+alreadyPresent,expectedNamed);assert.equal(unknown,0);
  const [after]=await c.execute('SELECT matchup_id,song_a_entry_id,song_b_entry_id,winner_entry_id,random_tiebreaker_vote_entry_id FROM matchups WHERE bracket_id=? ORDER BY matchup_id',[bracket.bracket_id]);
  assert.deepEqual(after,before,'Recorded matchups, progression and winners must stay unchanged.');
  const [[afterBracket]]=await c.execute('SELECT * FROM brackets WHERE bracket_id=?',[bracket.bracket_id]);
  assert.deepEqual(afterBracket,bracket,'Bracket metadata must stay unchanged.');
  if(apply) await c.commit();else await c.rollback();
  console.log(JSON.stringify({applied:apply,inserted,alreadyPresent,reportedTotalVotes:reportedTotal,unidentifiedVotesNotInvented:reportedTotal-expectedNamed,round32MatchupsImported:counts.length,allRecordedWinnersPreserved:before.length,partialTalliesDisagreeingWithRecordedWinners:counts.filter(match=>match.partialTallyDisagreesWithWinner).length}));
} catch(error) {await c.rollback();throw error;} finally {await c.end();}
