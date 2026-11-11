import { randomizeReadyRounds, readyRoundSql } from './round-randomization.mjs';
import { createHash } from 'node:crypto';
import { resolveWinner, randomTiebreakerVote } from './tiebreaker.mjs';
const fail=(status,message,extra={})=>Object.assign(new Error(message),{status,...extra});

export function ballotRevision(match, participants) {
  return createHash('sha256').update(JSON.stringify({a:match.songAEntryId,b:match.songBEntryId,winner:match.winnerEntryId,random:match.randomVote,tieBreak:match.tieBreakEntryId,ballots:participants.map(p=>[p.userId,p.selectedEntryId,p.submittedAt])})).digest('hex');
}
export function validateBallotEdits(ballots, participants, match) {
  if (!Array.isArray(ballots) || !ballots.length) throw fail(400,'No ballot changes were provided.');
  const seen=new Set();
  for(const ballot of ballots) {
    if (!ballot || !Number.isSafeInteger(ballot.userId) || seen.has(ballot.userId) || !participants.some(p=>Number(p.userId)===ballot.userId)) throw fail(400,'Choose a valid bracket participant once per ballot.');
    if (ballot.selectedEntryId !== null && ![Number(match.songAEntryId),Number(match.songBEntryId)].includes(ballot.selectedEntryId)) throw fail(400,'Choose one of this matchup’s songs, or No vote.');
    seen.add(ballot.userId);
  }
}
export function correctedWinner(match, participants, tieBreakEntryId, draw) {
  const a=Number(match.songAEntryId), b=Number(match.songBEntryId);
  const votesForA=participants.filter(p=>Number(p.selectedEntryId)===a).length;
  const votesForB=participants.filter(p=>Number(p.selectedEntryId)===b).length;
  if (!match.isClosed && !match.winnerEntryId && !match.inFinale) return {winner:null,randomVote:null};
  const policy=match.inFinale ? (['random','seed','seed_low'].includes(tieBreakEntryId) ? tieBreakEntryId : 'admin_pick') : match.tiebreakerOption;
  const admin=participants.filter(p=>(p.user_role==='super' || p.bracket_role==='commissioner') && p.selectedEntryId!=null).sort((x,y)=>(Number(y.userId)===Number(match.createdBy))-(Number(x.userId)===Number(match.createdBy)) || Number(x.userId)-Number(y.userId))[0];
  const pick=match.inFinale ? (tieBreakEntryId==='admin_vote' ? (admin ? Number(admin.selectedEntryId) : null) : tieBreakEntryId) : tieBreakEntryId ?? (match.tieBreakEntryId != null ? Number(match.tieBreakEntryId) : admin ? Number(admin.selectedEntryId):null);
  // Retain an already-recorded random draw while the participant count remains tied.
  const existingRandom=match.randomVote == null ? null : Number(match.randomVote);
  const winner=policy==='random' && votesForA===votesForB && [a,b].includes(existingRandom)
    ? existingRandom
    : resolveWinner({votesForA,votesForB,songAEntryId:a,songBEntryId:b,songASeed:Number(match.songASeed),songBSeed:Number(match.songBSeed),tiebreakerOption:policy,adminPick:pick},draw);
  return {winner,randomVote:(!match.inFinale || tieBreakEntryId==='admin_vote') && policy==='admin_pick' && votesForA===votesForB ? winner : randomTiebreakerVote({votesForA,votesForB,tiebreakerOption:policy},winner)};
}

export async function getBallotEditingRound(c,bracketId) {
  const [[row]]=await c.execute(`SELECT br.finale_start_round AS finaleStartRound,f.bracket_id AS finaleSessionId,CASE
    WHEN br.status='complete' OR br.completed_at IS NOT NULL THEN (SELECT MAX(round_number) FROM bracket_rounds WHERE bracket_id=br.bracket_id)
    WHEN f.bracket_id IS NOT NULL OR br.randomization_mode='each_round' THEN COALESCE((SELECT MIN(r.round_number) FROM bracket_rounds r JOIN bracket_weeks w ON w.bracket_id=r.bracket_id AND w.round_id=r.round_id JOIN matchups m ON m.bracket_id=w.bracket_id AND m.week_id=w.week_id WHERE r.bracket_id=br.bracket_id AND r.round_number>=COALESCE(f.start_round_number,1) AND m.winner_entry_id IS NULL),(SELECT MAX(round_number) FROM bracket_rounds WHERE bracket_id=br.bracket_id))
    ELSE (SELECT MAX(r.round_number) FROM bracket_rounds r JOIN bracket_weeks w ON w.bracket_id=r.bracket_id AND w.round_id=r.round_id WHERE r.bracket_id=br.bracket_id AND w.opens_at<=COALESCE(br.paused_at,NOW(6)))
    END AS currentRound FROM brackets br LEFT JOIN bracket_finale_sessions f ON f.bracket_id=br.bracket_id WHERE br.bracket_id=?`,[bracketId]);
  const current=Number(row?.currentRound)||1;
  return row?.finaleStartRound!=null && row?.finaleSessionId==null ? Math.min(current,Math.max(1,Number(row.finaleStartRound)-1)):current;
}
export function roundAllowsBallotEditing(round,currentRound) { return round>=currentRound-1 && round<=currentRound; }

export async function loadAdminBallots(c,bracketId,matchupId,familyId,lock=false) {
  const [brackets]=await c.execute('SELECT bracket_id FROM brackets WHERE bracket_id=? AND family_id=?'+(lock?' FOR UPDATE':''),[bracketId,familyId]);
  if(!brackets.length) throw fail(404,'Bracket not found.');
  const [rows]=await c.execute(`SELECT m.matchup_id AS matchupId,m.song_a_entry_id AS songAEntryId,m.song_b_entry_id AS songBEntryId,
    m.winner_entry_id AS winnerEntryId,m.admin_tiebreaker_entry_id AS tieBreakEntryId,m.random_tiebreaker_vote_entry_id AS randomVote,m.next_matchup_id AS nextMatchupId,m.next_slot AS nextSlot,
    w.week_number AS weekNumber,m.matchup_number AS matchupNumber,r.round_number AS roundNumber,
    sa.title AS songATitle,sb.title AS songBTitle,
    sa.youtube_url AS songAYoutubeUrl,sa.spotify_url AS songASpotifyUrl,sb.youtube_url AS songBYoutubeUrl,sb.spotify_url AS songBSpotifyUrl,
    COALESCE(albumA.title,sa.album) AS songAAlbum,COALESCE(albumB.title,sb.album) AS songBAlbum,
    CASE WHEN albumA.bracket_album_id IS NOT NULL THEN albumA.album_cover_url ELSE sa.album_cover_url END AS songAAlbumCoverUrl,
    CASE WHEN albumB.bracket_album_id IS NOT NULL THEN albumB.album_cover_url ELSE sb.album_cover_url END AS songBAlbumCoverUrl,
    CASE WHEN albumA.bracket_album_id IS NOT NULL THEN albumA.year ELSE sa.year END AS songAYear,
    CASE WHEN albumB.bracket_album_id IS NOT NULL THEN albumB.year ELSE sb.year END AS songBYear,
    CASE WHEN br.seeding_size IS NOT NULL THEN a.assigned_seed ELSE a.seed_number END AS songASeed,CASE WHEN br.seeding_size IS NOT NULL THEN b.assigned_seed ELSE b.seed_number END AS songBSeed,
    br.seeding_size AS seedingSize,br.tiebreaker_option AS tiebreakerOption,br.created_by_user_id AS createdBy,br.finale_start_round AS plannedFinaleRound,f.bracket_id AS finaleSessionId,${readyRoundSql('br','r')} AS roundReady,
    (w.closes_at<=COALESCE(br.paused_at,NOW(6))) AS isClosed,
    (br.start_at IS NOT NULL AND br.start_at<=NOW(6) AND br.status<>'draft') AS hasStarted,
    (w.opens_at<=COALESCE(br.paused_at,NOW(6))) AS hasOpened,
    (f.bracket_id IS NOT NULL AND r.round_number>=f.start_round_number) AS inFinale,
    (SELECT COUNT(*) FROM matchups feeder WHERE feeder.bracket_id=m.bracket_id AND feeder.next_matchup_id=m.matchup_id AND feeder.winner_entry_id IS NULL) AS pendingFeeders
    FROM matchups m JOIN brackets br ON br.bracket_id=m.bracket_id
    JOIN bracket_weeks w ON w.bracket_id=m.bracket_id AND w.week_id=m.week_id
    JOIN bracket_rounds r ON r.bracket_id=m.bracket_id AND r.round_id=w.round_id
    JOIN bracket_songs a ON a.bracket_song_id=m.song_a_entry_id AND a.bracket_id=m.bracket_id
    JOIN bracket_songs b ON b.bracket_song_id=m.song_b_entry_id AND b.bracket_id=m.bracket_id
    JOIN songs sa ON sa.song_id=a.song_id JOIN songs sb ON sb.song_id=b.song_id
    LEFT JOIN bracket_albums albumA ON albumA.bracket_id=a.bracket_id AND albumA.bracket_album_id=a.bracket_album_id
    LEFT JOIN bracket_albums albumB ON albumB.bracket_id=b.bracket_id AND albumB.bracket_album_id=b.bracket_album_id
    LEFT JOIN bracket_finale_sessions f ON f.bracket_id=m.bracket_id
    WHERE m.bracket_id=? AND m.matchup_id=?${lock?' FOR UPDATE':''}`,[bracketId,matchupId]);
  if(!rows.length) throw fail(404,'Matchup not found.');
  const match=rows[0];
  const currentRound=await getBallotEditingRound(c,bracketId);
  const roundAllowed=roundAllowsBallotEditing(Number(match.roundNumber),currentRound);
  const editRestriction=!match.hasStarted ? 'Voting opens at the scheduled bracket start time. Accepting an invitation does not start voting.' : match.plannedFinaleRound!=null && Number(match.roundNumber)>=Number(match.plannedFinaleRound) && match.finaleSessionId==null ? 'This round is reserved for the finale. Begin Finale Mode to record in-person votes.' : !match.roundReady ? 'Every winner from the previous round must be known before this round can be randomized and edited.' : !roundAllowed ? 'Only the current round and the immediately previous round can be edited. Older rounds are locked.' : !(match.hasOpened||match.inFinale)||Number(match.pendingFeeders) ? 'This matchup must open and both feeder winners must be decided before its ballots can be edited.' : '';
  const [participants]=await c.execute(`SELECT u.user_id AS userId,u.display_name AS displayName,u.user_role,bm.bracket_role,
    v.selected_entry_id AS selectedEntryId,v.submitted_at AS submittedAt
    FROM bracket_members bm JOIN users u ON u.user_id=bm.user_id
    LEFT JOIN votes v ON v.bracket_id=bm.bracket_id AND v.user_id=bm.user_id AND v.matchup_id=? AND v.submitted_at IS NOT NULL
    WHERE bm.bracket_id=? AND bm.invitation_status='accepted' AND (CASE WHEN ?=1 THEN bm.finale_participant ELSE bm.non_finale_participant END = TRUE OR v.vote_id IS NOT NULL)
    ORDER BY u.user_id${lock?' FOR UPDATE':''}`,[matchupId,bracketId,match.inFinale?1:0]);
  return {...match,participants,revision:ballotRevision(match,participants),canEdit:!editRestriction,editRestriction};
}

export async function saveAdminBallots(c,bracketId,matchupId,familyId,input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400,'Provide ballot edits as a JSON object.');
  const match=await loadAdminBallots(c,bracketId,matchupId,familyId,true);
  if(!match.canEdit) throw fail(409,match.editRestriction);
  if(input.revision!==match.revision) throw fail(409,'Votes have changed since this editor opened. Close and reopen the editor to load the latest votes.');
  if (!(Array.isArray(input.ballots) && input.ballots.length===0 && Object.hasOwn(input,'tieBreakEntryId'))) validateBallotEdits(input.ballots,match.participants,match);
  let tiePick=Object.hasOwn(input,'tieBreakEntryId') ? input.tieBreakEntryId : match.tieBreakEntryId??null;
  if(tiePick==='admin_vote' && !match.inFinale && match.tiebreakerOption==='admin_pick') {
    const admin=match.participants.filter(p=>(p.user_role==='super' || p.bracket_role==='commissioner')).sort((a,b)=>(Number(b.userId)===Number(match.createdBy))-(Number(a.userId)===Number(match.createdBy)) || Number(a.userId)-Number(b.userId)).find(p=>{
      const edit=input.ballots.find(ballot=>ballot.userId===Number(p.userId));
      return (edit ? edit.selectedEntryId : p.selectedEntryId)!=null;
    });
    if(!admin) throw fail(400,'Record the admin’s participant vote first, or choose a song for the tiebreaker.');
    tiePick=Number(input.ballots.find(ballot=>ballot.userId===Number(admin.userId))?.selectedEntryId ?? admin.selectedEntryId);
  }

  if(['seed','seed_low'].includes(tiePick) && !match.seedingSize) throw fail(400,'Select Use Seeds before choosing a seed tiebreaker.');
  if(tiePick!==null && !(match.inFinale && ['random','seed','seed_low','admin_vote'].includes(tiePick)) && ![Number(match.songAEntryId),Number(match.songBEntryId)].includes(tiePick)) throw fail(400,'Choose a valid tiebreaker song.');
  const edited=match.participants.map(person=>{
    const edit=input.ballots.find(ballot=>ballot.userId===Number(person.userId));
    return edit?{...person,selectedEntryId:edit.selectedEntryId}:person;
  });
  const result=correctedWinner(match,edited,tiePick);
  const previous=match.winnerEntryId==null?null:Number(match.winnerEntryId);
  const descendants=[];
  if(result.winner!==previous) {
    let next=match.nextMatchupId;
    const seen=new Set([matchupId]);
    while(next) {
      if(seen.has(Number(next))) throw fail(409,'The bracket has an invalid progression link.');
      seen.add(Number(next));
      const [rows]=await c.execute(`SELECT m.matchup_id AS matchupId,m.next_matchup_id AS nextMatchupId,m.next_slot AS nextSlot,m.song_a_entry_id AS songAEntryId,m.winner_entry_id AS winnerEntryId,
        (SELECT COUNT(*) FROM votes v WHERE v.bracket_id=m.bracket_id AND v.matchup_id=m.matchup_id) AS voteCount FROM matchups m WHERE m.bracket_id=? AND m.matchup_id=? FOR UPDATE`,[bracketId,next]);
      if(!rows.length) throw fail(409,'The next matchup could not be found.');
      descendants.push(rows[0]);next=rows[0].nextMatchupId;
    }
    const ballots=descendants.reduce((n,m)=>n+Number(m.voteCount),0);
    const results=descendants.filter(m=>m.winnerEntryId!=null).length;
    if((ballots||results)&&input.resetLaterRounds!==true) throw fail(409,`This changes the advancing song. Continuing will clear ${ballots} later ballot(s) and ${results} later result(s) on this path. Other matchups are kept.`,{requiresReset:true});
  }
  // No database changes occur until validation and downstream confirmation succeed.
  if(!match.inFinale && match.tiebreakerOption==='admin_pick') await c.execute('UPDATE matchups SET admin_tiebreaker_entry_id=? WHERE bracket_id=? AND matchup_id=?',[tiePick,bracketId,matchupId]);
  for(const ballot of input.ballots) {
    if(ballot.selectedEntryId===null) await c.execute('DELETE FROM votes WHERE bracket_id=? AND matchup_id=? AND user_id=?',[bracketId,matchupId,ballot.userId]);
    else await c.execute(`INSERT INTO votes (bracket_id,matchup_id,user_id,selected_entry_id,submitted_at) VALUES (?,?,?,?,NOW())
      ON DUPLICATE KEY UPDATE selected_entry_id=VALUES(selected_entry_id),submitted_at=NOW()`,[bracketId,matchupId,ballot.userId,ballot.selectedEntryId]);
  }
  for(const downstream of descendants) {
    await c.execute('DELETE FROM votes WHERE bracket_id=? AND matchup_id=?',[bracketId,downstream.matchupId]);
    await c.execute('UPDATE matchups SET winner_entry_id=NULL,random_tiebreaker_vote_entry_id=NULL,admin_tiebreaker_entry_id=NULL WHERE bracket_id=? AND matchup_id=?',[bracketId,downstream.matchupId]);
  }
  await c.execute('UPDATE matchups SET winner_entry_id=?,random_tiebreaker_vote_entry_id=? WHERE bracket_id=? AND matchup_id=?',[result.winner,result.randomVote,bracketId,matchupId]);
  if(result.winner!==previous) {
    let slot=match.nextSlot, anchor=result.winner??Number(match.songAEntryId);
    for(const downstream of descendants) {
      if(!['A','B'].includes(slot)) throw fail(409,'The bracket has an invalid next slot.');
      await c.execute(`UPDATE matchups SET ${slot==='A'?'song_a_entry_id':'song_b_entry_id'}=? WHERE bracket_id=? AND matchup_id=?`,[anchor,bracketId,downstream.matchupId]);
      anchor=slot==='A'?anchor:Number(downstream.songAEntryId);slot=downstream.nextSlot;
    }
    const [[final]]=await c.execute('SELECT m.winner_entry_id AS winner FROM matchups m JOIN bracket_weeks w ON w.week_id=m.week_id AND w.bracket_id=m.bracket_id JOIN bracket_rounds r ON r.round_id=w.round_id AND r.bracket_id=m.bracket_id WHERE m.bracket_id=? ORDER BY r.round_number DESC LIMIT 1',[bracketId]);
    await c.execute("UPDATE brackets SET status=?,completed_at=CASE WHEN ?=1 THEN COALESCE(completed_at,NOW()) ELSE NULL END WHERE bracket_id=?",[final.winner?'complete':'active',final.winner?1:0,bracketId]);
    await c.execute("UPDATE bracket_finale_sessions SET status=CASE WHEN ?=1 THEN 'complete' WHEN status='complete' THEN 'paused' ELSE status END,completed_at=CASE WHEN ?=1 THEN COALESCE(completed_at,NOW()) ELSE NULL END WHERE bracket_id=?",[final.winner?1:0,final.winner?1:0,bracketId]);
  }
  await randomizeReadyRounds(c,bracketId);
  const participantVotesA=edited.filter(person=>Number(person.selectedEntryId)===Number(match.songAEntryId)).length;
  const participantVotesB=edited.filter(person=>Number(person.selectedEntryId)===Number(match.songBEntryId)).length;
  return {saved:true,winnerEntryId:result.winner,randomTiebreakerVoteEntryId:result.randomVote,
    participantVotesA,participantVotesB,
    voteCountA:participantVotesA+(result.randomVote===Number(match.songAEntryId)?1:0),
    voteCountB:participantVotesB+(result.randomVote===Number(match.songBEntryId)?1:0)};
}
