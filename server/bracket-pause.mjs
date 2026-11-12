import {getManagedSessions,saveManagedSessions,validateSessionDates} from './session-management.mjs';
export async function setBracketPaused(connection, bracketId, familyId, pause) {
  const [rows] = await connection.execute(`SELECT b.paused_at AS pausedAt,b.status,b.start_at AS startAt,
    (b.status='active' AND b.completed_at IS NULL AND (b.start_at IS NULL OR b.start_at<=NOW())) AS canPause
    FROM brackets b WHERE b.bracket_id=? AND b.family_id=? FOR UPDATE`,[bracketId,familyId]);
  if (!rows.length) throw Object.assign(new Error('Bracket not found.'),{status:404});
  const bracket=rows[0];
  if (!bracket.canPause) throw Object.assign(new Error('Only an active bracket can be paused or resumed.'),{status:409});
  if (pause && !bracket.pausedAt) {
    await connection.execute('UPDATE brackets SET paused_at=NOW(6) WHERE bracket_id=?',[bracketId]);
  } else if (!pause && bracket.pausedAt) {
    // Only uncompleted sessions move; the open session keeps its original opening time.
    await connection.execute(`UPDATE bracket_weeks w JOIN brackets b ON b.bracket_id=w.bracket_id
      SET w.opens_at=CASE WHEN w.opens_at>b.paused_at THEN TIMESTAMPADD(MICROSECOND,TIMESTAMPDIFF(MICROSECOND,b.paused_at,NOW(6)),w.opens_at) ELSE w.opens_at END,
          w.closes_at=TIMESTAMPADD(MICROSECOND,TIMESTAMPDIFF(MICROSECOND,b.paused_at,NOW(6)),w.closes_at)
      WHERE w.bracket_id=? AND w.closes_at>b.paused_at`,[bracketId]);
    await connection.execute('UPDATE brackets SET paused_at=NULL WHERE bracket_id=?',[bracketId]);
  }
  return { paused:pause };
}

export async function getResumeSchedule(connection,bracketId,familyId) {
  const current=await getManagedSessions(connection,bracketId,familyId);
  if(!current.paused || current.status!=='active') throw Object.assign(new Error('This bracket is no longer paused. Refresh the page.'),{status:409});
  const pauseTime=new Date(current.effectiveAt).getTime(),delay=Math.max(0,Date.now()-pauseTime);
  const sessions=current.sessions.map(session=>{
    const finished=Number(session.decidedCount)>0 || (session.closesAt && new Date(session.closesAt).getTime()<=pauseTime);
    const startLocked=finished || (session.opensAt && new Date(session.opensAt).getTime()<=pauseTime);
    const shift=value=>value ? new Date(new Date(value).getTime()+delay).toISOString() : null;
    return {...session,startLocked:!!startLocked,endLocked:!!finished,
      opensAt:!session.isFinale && !startLocked ? shift(session.opensAt):session.opensAt,
      closesAt:!session.isFinale && !finished ? shift(session.closesAt):session.closesAt};
  });
  return {...current,sessions};
}

export async function resumeWithSchedule(connection,bracketId,familyId,input) {
  const current=await getManagedSessions(connection,bracketId,familyId,true);
  if(!current.paused || current.status!=='active' || current.effectiveAt!==input.pausedAt || current.revision!==input.revision)
    throw Object.assign(new Error('The bracket or session dates changed. Close and reopen Resume bracket.'),{status:409});
  const changes=validateSessionDates(input.sessions,current.sessions,current.noTimer);
  const pauseTime=new Date(current.effectiveAt).getTime();
  for(let i=0;i<changes.length;i++) {
    const original=current.sessions[i],change=changes[i];
    const same=(a,b)=>(a?new Date(a).getTime():null)===(b?new Date(b).getTime():null);
    const finished=Number(original.decidedCount)>0 || (original.closesAt && new Date(original.closesAt).getTime()<=pauseTime);
    const opened=original.opensAt && new Date(original.opensAt).getTime()<=pauseTime;
    if(((finished || opened || original.isFinale) && !same(original.opensAt,change.opensAt)) || ((finished || original.isFinale) && !same(original.closesAt,change.closesAt)))
      throw Object.assign(new Error('Past sessions, existing opening times, and finale dates cannot be changed when resuming.'),{status:409});
    if(!finished && !original.isFinale && change.closesAt && change.closesAt<=new Date())
      throw Object.assign(new Error(`Week ${original.weekNumber} must end in the future to resume voting.`),{status:400});
  }
  // Persist exactly the reviewed dates and clear the pause in the same transaction.
  // Do not apply the automatic pause-duration shift a second time.
  await saveManagedSessions(connection,bracketId,familyId,input);
  await connection.execute('UPDATE brackets SET paused_at=NULL WHERE bracket_id=?',[bracketId]);
  return {paused:false};
}
