import {resolveWinner,randomTiebreakerVote} from './tiebreaker.mjs';
import {randomizeReadyRounds,readyRoundSql} from './round-randomization.mjs';

export async function finalizeClosedMatchups(connection,bracketId=null,weekId=null) {
  let finalizedCount=0;
  const [matchups] = await connection.execute(
        `SELECT m.matchup_id AS matchupId,m.bracket_id AS bracketId,
                m.song_a_entry_id AS songAEntryId,m.song_b_entry_id AS songBEntryId,
                m.next_matchup_id AS nextMatchupId,m.next_slot AS nextSlot,
                r.round_number AS roundNumber,
                b.tiebreaker_option AS tiebreakerOption,m.admin_tiebreaker_entry_id AS tieBreakEntryId,
                (SELECT CASE WHEN b.seeding_size IS NOT NULL THEN assigned_seed ELSE seed_number END FROM bracket_songs WHERE bracket_song_id=m.song_a_entry_id) AS songASeed,
                (SELECT CASE WHEN b.seeding_size IS NOT NULL THEN assigned_seed ELSE seed_number END FROM bracket_songs WHERE bracket_song_id=m.song_b_entry_id) AS songBSeed,
                (SELECT v.selected_entry_id FROM votes v JOIN users u ON u.user_id=v.user_id
                 WHERE v.matchup_id=m.matchup_id AND v.bracket_id=m.bracket_id AND v.submitted_at IS NOT NULL AND (u.user_role='super' OR EXISTS (SELECT 1 FROM bracket_members cm WHERE cm.bracket_id=m.bracket_id AND cm.user_id=u.user_id AND cm.bracket_role='commissioner' AND cm.invitation_status='accepted'))
                 ORDER BY (u.user_id=b.created_by_user_id) DESC,u.user_id LIMIT 1) AS adminPick,
                (SELECT MAX(last_round.round_number) FROM bracket_rounds last_round WHERE last_round.bracket_id=m.bracket_id) AS finalRoundNumber,
                (SELECT COUNT(*) FROM votes v WHERE v.matchup_id=m.matchup_id AND v.submitted_at IS NOT NULL AND v.selected_entry_id=m.song_a_entry_id) AS votesForA,
                (SELECT COUNT(*) FROM votes v WHERE v.matchup_id=m.matchup_id AND v.submitted_at IS NOT NULL AND v.selected_entry_id=m.song_b_entry_id) AS votesForB
         FROM matchups m
         JOIN bracket_weeks w ON w.bracket_id=m.bracket_id AND w.week_id=m.week_id
         JOIN bracket_rounds r ON r.bracket_id=m.bracket_id AND r.round_id=w.round_id
         JOIN brackets b ON b.bracket_id=m.bracket_id
         WHERE w.closes_at<=NOW(6) AND m.winner_entry_id IS NULL
           AND (? IS NULL OR b.bracket_id=?) AND (? IS NULL OR w.week_id=?)
           AND ${priorSessionsReadySql('b','w')}
           AND m.song_a_entry_id IS NOT NULL AND m.song_b_entry_id IS NOT NULL
           AND b.completed_at IS NULL AND b.status='active' AND b.paused_at IS NULL AND b.start_at<=NOW(6)
           AND (b.finale_start_round IS NULL OR r.round_number<b.finale_start_round)
           AND ${readyRoundSql('b','r')}
           AND NOT EXISTS (SELECT 1 FROM matchups feeder WHERE feeder.bracket_id=m.bracket_id AND feeder.next_matchup_id=m.matchup_id AND feeder.winner_entry_id IS NULL)
           AND NOT EXISTS (SELECT 1 FROM bracket_finale_sessions f WHERE f.bracket_id=b.bracket_id)
         FOR UPDATE`,
        [bracketId,bracketId,weekId,weekId]
      );

      for (const matchup of matchups) {
        const votesForA = Number(matchup.votesForA);
        const votesForB = Number(matchup.votesForB);
        const winnerEntryId = resolveWinner({
          votesForA, votesForB, songAEntryId:Number(matchup.songAEntryId), songBEntryId:Number(matchup.songBEntryId),
          tiebreakerOption:matchup.tiebreakerOption, songASeed:Number(matchup.songASeed), songBSeed:Number(matchup.songBSeed),
          adminPick:matchup.tieBreakEntryId != null ? Number(matchup.tieBreakEntryId) : matchup.adminPick == null ? null : Number(matchup.adminPick)
        });
        if (winnerEntryId === null) continue;
        const [updated] = await connection.execute(
          'UPDATE matchups SET winner_entry_id=?,random_tiebreaker_vote_entry_id=? WHERE matchup_id=? AND bracket_id=? AND winner_entry_id IS NULL',
          [winnerEntryId, matchup.tiebreakerOption==='admin_pick' && votesForA===votesForB ? winnerEntryId : randomTiebreakerVote({votesForA,votesForB,tiebreakerOption:matchup.tiebreakerOption},winnerEntryId), matchup.matchupId, matchup.bracketId]
        );
        if (!updated.affectedRows) continue;

        if (matchup.nextMatchupId && matchup.nextSlot === 'A') {
          await connection.execute(
            'UPDATE matchups SET song_a_entry_id=? WHERE matchup_id=? AND bracket_id=?',
            [winnerEntryId, matchup.nextMatchupId, matchup.bracketId]
          );
        } else if (matchup.nextMatchupId && matchup.nextSlot === 'B') {
          await connection.execute(
            'UPDATE matchups SET song_b_entry_id=? WHERE matchup_id=? AND bracket_id=?',
            [winnerEntryId, matchup.nextMatchupId, matchup.bracketId]
          );
        } else if (Number(matchup.roundNumber) === Number(matchup.finalRoundNumber)) {
          await connection.execute(
            `UPDATE brackets SET status='complete',completed_at=NOW(6)
             WHERE bracket_id=? AND completed_at IS NULL`,
            [matchup.bracketId]
          );
        }
        await randomizeReadyRounds(connection,matchup.bracketId);
        finalizedCount++;
      }
  return finalizedCount;
}

const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function closeFullyVotedWeeks(c) {
  const [weeks]=await c.execute(`SELECT w.week_id FROM bracket_weeks w JOIN brackets b ON b.bracket_id=w.bracket_id JOIN bracket_rounds r ON r.bracket_id=w.bracket_id AND r.round_id=w.round_id
    WHERE b.session_duration_minutes IS NULL AND b.status='active' AND b.completed_at IS NULL AND b.paused_at IS NULL AND b.start_at<=NOW(6)
      AND w.opens_at<=NOW(6) AND (w.closes_at IS NULL OR w.closes_at>NOW(6))
      AND (b.finale_start_round IS NULL OR r.round_number<b.finale_start_round)
      AND NOT EXISTS (SELECT 1 FROM bracket_finale_sessions f WHERE f.bracket_id=b.bracket_id)
      AND ${readyRoundSql('b','r')} AND ${priorSessionsReadySql('b','w')}
      AND EXISTS (SELECT 1 FROM matchups m WHERE m.week_id=w.week_id AND m.bracket_id=b.bracket_id)
      AND NOT EXISTS (SELECT 1 FROM matchups m JOIN matchups feeder ON feeder.next_matchup_id=m.matchup_id AND feeder.bracket_id=m.bracket_id WHERE m.week_id=w.week_id AND feeder.winner_entry_id IS NULL)
      AND EXISTS (SELECT 1 FROM bracket_members bm WHERE bm.bracket_id=b.bracket_id AND bm.invitation_status='accepted' AND bm.non_finale_participant=TRUE)
      AND NOT EXISTS (SELECT 1 FROM bracket_members bm JOIN matchups m ON m.bracket_id=bm.bracket_id AND m.week_id=w.week_id
        WHERE bm.bracket_id=b.bracket_id AND bm.invitation_status='accepted' AND bm.non_finale_participant=TRUE AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.bracket_id=b.bracket_id AND v.matchup_id=m.matchup_id AND v.user_id=bm.user_id AND v.submitted_at IS NOT NULL AND v.selected_entry_id IN (m.song_a_entry_id,m.song_b_entry_id)))
    FOR UPDATE`);
  for(const week of weeks)await c.execute('UPDATE bracket_weeks SET closes_at=NOW(6) WHERE week_id=?',[week.week_id]);
}
export async function openNextUntimedWeeks(c) {
  const [weeks]=await c.execute(`SELECT w.week_id FROM bracket_weeks w JOIN brackets b ON b.bracket_id=w.bracket_id JOIN bracket_rounds r ON r.bracket_id=w.bracket_id AND r.round_id=w.round_id
    WHERE b.session_duration_minutes IS NULL AND b.status='active' AND b.completed_at IS NULL AND b.paused_at IS NULL AND b.start_at<=NOW()
      AND w.opens_at IS NULL AND (b.finale_start_round IS NULL OR r.round_number<b.finale_start_round)
      AND NOT EXISTS (SELECT 1 FROM bracket_finale_sessions f WHERE f.bracket_id=b.bracket_id)
      AND ${readyRoundSql('b','r')}
      AND NOT EXISTS (SELECT 1 FROM bracket_weeks prior JOIN matchups m ON m.bracket_id=prior.bracket_id AND m.week_id=prior.week_id WHERE prior.bracket_id=b.bracket_id AND prior.week_number<w.week_number AND m.winner_entry_id IS NULL)
    FOR UPDATE`);
  for(const week of weeks)await c.execute('UPDATE bracket_weeks SET opens_at=NOW(6) WHERE week_id=?',[week.week_id]);
}
export async function getAdvanceWeekPlan(c,bracketId,familyId,lock=false) {
  const [brackets]=await c.execute(`SELECT b.status,b.completed_at,b.paused_at,b.session_duration_minutes,b.finale_start_round,(b.start_at<=NOW(6)) AS hasStarted,
    (SELECT COUNT(*) FROM bracket_finale_sessions f WHERE f.bracket_id=b.bracket_id) AS finaleSessions
    FROM brackets b WHERE b.bracket_id=? AND b.family_id=?${lock?' FOR UPDATE':''}`,[bracketId,familyId]);
  if(!brackets.length)throw fail(404,'Bracket not found.');
  const b=brackets[0];
  if(b.hasStarted===0||b.hasStarted===null)throw fail(409,'Voting opens at the scheduled bracket start time.');
  if(b.status!=='active'||b.completed_at||b.paused_at||Number(b.finaleSessions))throw fail(409,'Only an active, unpaused online bracket can advance a week.');
  const [weeks]=await c.execute(`SELECT w.week_id AS weekId,w.week_number AS weekNumber,w.opens_at AS opensAt,w.closes_at AS closesAt,r.round_number AS roundNumber,
    ${readyRoundSql('b','r')} AS roundReady,
    (SELECT COUNT(*) FROM matchups m WHERE m.bracket_id=w.bracket_id AND m.week_id=w.week_id AND m.winner_entry_id IS NULL) AS pending
    FROM bracket_weeks w JOIN brackets b ON b.bracket_id=w.bracket_id JOIN bracket_rounds r ON r.bracket_id=w.bracket_id AND r.round_id=w.round_id
    WHERE w.bracket_id=? ORDER BY w.week_number${lock?' FOR UPDATE':''}`,[bracketId]);
  const week=weeks.find(w=>Number(w.pending)>0);
  if(!week||!week.opensAt||new Date(week.opensAt)>new Date()||!week.roundReady||(b.finale_start_round!=null&&week.roundNumber>=b.finale_start_round))throw fail(409,'There is no open online voting week ready to advance.');
  const next=weeks.find(w=>w.weekNumber>week.weekNumber);
  const nextOnline=next && (b.finale_start_round==null||next.roundNumber<b.finale_start_round)?next:null;
  return {weekId:Number(week.weekId),weekNumber:Number(week.weekNumber),nextWeekId:nextOnline?Number(nextOnline.weekId):null,nextWeekNumber:nextOnline?Number(nextOnline.weekNumber):null,nextClosesAt:nextOnline?.closesAt??null,noTimer:b.session_duration_minutes==null};
}
export function parseNextSessionEnd(input,plan,now=new Date()) {
  if(plan.nextWeekId==null)return null;
  if(input.nextClosesAt==null||input.nextClosesAt==='') {
    if(!plan.noTimer)throw fail(400,'Choose when the next session should end.');
    return null;
  }
  const date=new Date(input.nextClosesAt);
  if(!Number.isFinite(date.getTime())||date<=now)throw fail(400,'The next session must end in the future.');
  return date;
}
export async function advanceWeek(c,bracketId,familyId,input) {
  const plan=await getAdvanceWeekPlan(c,bracketId,familyId,true);
  if(input.weekId!==plan.weekId)throw fail(409,'The voting week has changed. Close and reopen this modal.');
  const end=parseNextSessionEnd(input,plan);
  await c.execute('UPDATE bracket_weeks SET closes_at=NOW(6) WHERE bracket_id=? AND week_id=?',[bracketId,plan.weekId]);
  await finalizeClosedMatchups(c,bracketId,plan.weekId);
  const [[pending]]=await c.execute('SELECT COUNT(*) AS total FROM matchups WHERE bracket_id=? AND week_id=? AND winner_entry_id IS NULL',[bracketId,plan.weekId]);
  if(Number(pending.total))throw fail(409,'This week has an unresolved tie. Record an admin vote or resolve the tied matchup before advancing.');
  if(plan.nextWeekId!=null) {
    if(plan.nextClosesAt && end) {
      const delta=end-new Date(plan.nextClosesAt);
      await c.execute('UPDATE bracket_weeks SET opens_at=TIMESTAMPADD(MICROSECOND,?,opens_at),closes_at=TIMESTAMPADD(MICROSECOND,?,closes_at) WHERE bracket_id=? AND week_number>?',[delta*1000,delta*1000,bracketId,plan.nextWeekNumber]);
    }
    await c.execute('UPDATE bracket_weeks SET opens_at=NOW(6),closes_at=? WHERE bracket_id=? AND week_id=?',[end,bracketId,plan.nextWeekId]);
  }
  await openNextUntimedWeeks(c);
  return {advanced:true,weekNumber:plan.weekNumber,nextWeekNumber:plan.nextWeekNumber};
}

export function priorSessionsReadySql(b='b',w='w') {
  return `(${b}.session_duration_minutes IS NOT NULL OR NOT EXISTS (SELECT 1 FROM bracket_weeks prior JOIN matchups pending ON pending.bracket_id=prior.bracket_id AND pending.week_id=prior.week_id WHERE prior.bracket_id=${b}.bracket_id AND prior.week_number<${w}.week_number AND pending.winner_entry_id IS NULL))`;
}
