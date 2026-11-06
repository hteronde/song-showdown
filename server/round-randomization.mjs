import { seededOrder } from './bracket-seeding.mjs';
import {randomInt} from 'node:crypto';
export const randomizationModes=['none','round1','each_round'];
export function shuffled(items,draw=randomInt) {
  const result=[...items];
  for(let i=result.length-1;i>0;i--) {const j=draw(i+1);[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export async function randomizeReadyRounds(c,bracketId) {
  const [[bracket]]=await c.execute('SELECT randomization_mode,seeding_size,finale_at,finale_start_round,COALESCE(paused_at,NOW(6)) AS effectiveNow FROM brackets WHERE bracket_id=? FOR UPDATE',[bracketId]);
  if(bracket?.randomization_mode!=='each_round') return;
  const [rounds]=await c.execute('SELECT round_id,round_number,randomized_at FROM bracket_rounds WHERE bracket_id=? ORDER BY round_number FOR UPDATE',[bracketId]);
  for(const round of rounds) {
    if(Number(round.round_number)===1||round.randomized_at) continue;
    const previous=rounds.find(r=>Number(r.round_number)===Number(round.round_number)-1);
    if(!previous) continue;
    const [feeders]=await c.execute('SELECT m.matchup_id,m.winner_entry_id FROM matchups m JOIN bracket_weeks w ON w.bracket_id=m.bracket_id AND w.week_id=m.week_id WHERE m.bracket_id=? AND w.round_id=? ORDER BY w.week_number,m.matchup_number FOR UPDATE',[bracketId,previous.round_id]);
    if(!feeders.length||feeders.some(match=>match.winner_entry_id==null)) continue;
    const [targets]=await c.execute(`SELECT m.matchup_id,m.winner_entry_id,w.week_number,w.opens_at,
      (SELECT COUNT(*) FROM votes v WHERE v.bracket_id=m.bracket_id AND v.matchup_id=m.matchup_id) AS votes
      FROM matchups m JOIN bracket_weeks w ON w.bracket_id=m.bracket_id AND w.week_id=m.week_id
      WHERE m.bracket_id=? AND w.round_id=? ORDER BY w.week_number,m.matchup_number FOR UPDATE`,[bracketId,round.round_id]);
    if(!targets.length||targets.length*2!==feeders.length) throw Object.assign(new Error('Round sizes do not match the advancing winners.'),{status:409});
    if(targets.some(match=>match.winner_entry_id!=null||Number(match.votes)>0)) throw Object.assign(new Error('Cannot randomize a round after its voting has started.'),{status:409});
    let order;
    if(bracket.seeding_size) {
      const [entries]=await c.execute('SELECT bracket_song_id,assigned_seed FROM bracket_songs WHERE bracket_id=?',[bracketId]);
      const ranks=new Map(entries.map(entry=>[Number(entry.bracket_song_id),Number(entry.assigned_seed)]));
      order=seededOrder(feeders,match=>ranks.get(Number(match.winner_entry_id)),true);
    } else order=shuffled(feeders);
    // Rewire feeder links to the drawn slots, so the diagram and future corrections follow the actual draw.
    for(let i=0;i<targets.length;i++) {
      await c.execute('UPDATE matchups SET song_a_entry_id=?,song_b_entry_id=? WHERE bracket_id=? AND matchup_id=?',[order[i*2].winner_entry_id,order[i*2+1].winner_entry_id,bracketId,targets[i].matchup_id]);
      for(let slot=0;slot<2;slot++) await c.execute('UPDATE matchups SET next_matchup_id=?,next_slot=? WHERE bracket_id=? AND matchup_id=?',[targets[i].matchup_id,slot===0?'A':'B',bracketId,order[i*2+slot].matchup_id]);
    }
    const earliest=new Date(bracket.effectiveNow).getTime();
    const delay=targets[0].opens_at==null?0:Math.max(0,earliest-new Date(targets[0].opens_at).getTime());
    if(delay>0) await c.execute('UPDATE bracket_weeks SET opens_at=TIMESTAMPADD(MICROSECOND,?,opens_at),closes_at=TIMESTAMPADD(MICROSECOND,?,closes_at) WHERE bracket_id=? AND week_number>=?',[delay*1000,delay*1000,bracketId,targets[0].week_number]);
    await c.execute('UPDATE bracket_rounds SET randomized_at=NOW(6) WHERE bracket_id=? AND round_id=?',[bracketId,round.round_id]);
  }
}
// SQL shared by all ballot-writing paths. A complete prior round is required even after corrections.
export function readyRoundSql(bracket='b',round='r') {
  return `(${bracket}.randomization_mode<>'each_round' OR ${round}.round_number=1 OR (${round}.randomized_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bracket_rounds priorRound JOIN bracket_weeks priorWeek ON priorWeek.bracket_id=priorRound.bracket_id AND priorWeek.round_id=priorRound.round_id JOIN matchups priorMatch ON priorMatch.bracket_id=priorWeek.bracket_id AND priorMatch.week_id=priorWeek.week_id WHERE priorRound.bracket_id=${bracket}.bracket_id AND priorRound.round_number=${round}.round_number-1 AND priorMatch.winner_entry_id IS NULL)))`;
}
