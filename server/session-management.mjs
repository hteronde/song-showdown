import {createHash} from 'node:crypto';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function sessionRevision(sessions) {
  return createHash('sha256').update(JSON.stringify(sessions.map(session=>[Number(session.weekId),session.opensAt,session.closesAt,Number(session.decidedCount)]))).digest('hex');
}
export function validateSessionDates(input,sessions,noTimer,now=new Date()) {
  if(!Array.isArray(input)||input.length!==sessions.length)throw fail(409,'The session list has changed. Reopen the bracket form to load the current sessions.');
  const seen=new Set();let previousStart=null,previousEnd=null;
  return sessions.map(session=>{
    const change=input.find(item=>item?.weekId===Number(session.weekId));
    if(!change||seen.has(change.weekId))throw fail(400,'Provide each session once.');
    seen.add(change.weekId);
    const parse=(value,label)=>{
      if(value==null||value==='')return null;
      if(typeof value!=='string')throw fail(400,`Enter a valid ${label} for Week ${session.weekNumber}.`);
      const date=new Date(value);if(!Number.isFinite(date.getTime()))throw fail(400,`Enter a valid ${label} for Week ${session.weekNumber}.`);return date;
    };
    const opensAt=parse(change.opensAt,'start date'),closesAt=parse(change.closesAt,'end date');
    // Finale rounds are one in-person event; the Finale Date and admin controls
    // govern them, rather than the online session windows.
    if(session.isFinale) {
      if(opensAt&&closesAt&&closesAt<=opensAt)throw fail(400,`Week ${session.weekNumber} must end after it starts.`);
      return {weekId:Number(session.weekId),opensAt,closesAt};
    }
    if(!noTimer&&(!opensAt||!closesAt))throw fail(400,`Week ${session.weekNumber} needs a start and end date.`);
    if(closesAt&&!opensAt)throw fail(400,`Set a start date before adding an end date for Week ${session.weekNumber}.`);
    if(opensAt&&closesAt&&closesAt<=opensAt)throw fail(400,`Week ${session.weekNumber} must end after it starts.`);
    if(opensAt&&previousStart&&opensAt<previousStart)throw fail(400,'Session start dates must stay in week order.');
    if(opensAt&&previousEnd&&opensAt<previousEnd)throw fail(400,`Week ${session.weekNumber} overlaps the previous session. Start it at or after the previous end.`);
    const changed=(opensAt?.getTime()??null)!==(session.opensAt?new Date(session.opensAt).getTime():null)||(closesAt?.getTime()??null)!==(session.closesAt?new Date(session.closesAt).getTime():null);
    if(changed&&Number(session.decidedCount)>0&&(!opensAt||!closesAt||closesAt>now))throw fail(409,`Week ${session.weekNumber} has decided matchups and cannot be reopened. Keep its end date in the past.`);
    if(opensAt)previousStart=opensAt;
    if(closesAt)previousEnd=closesAt;
    return {weekId:Number(session.weekId),opensAt,closesAt};
  });
}
export async function getManagedSessions(c,bracketId,familyId,lock=false) {
  const [brackets]=await c.execute(`SELECT b.bracket_id AS bracketId,b.status AS storedStatus,b.start_at AS startAt,b.session_duration_minutes AS duration,b.paused_at AS pausedAt,
    CASE WHEN b.completed_at IS NOT NULL OR b.status='complete' THEN 'complete' WHEN b.status='draft' THEN 'draft' WHEN b.start_at>NOW() THEN 'draft' ELSE b.status END AS status,
    COALESCE(b.finale_start_round,(SELECT f.start_round_number FROM bracket_finale_sessions f WHERE f.bracket_id=b.bracket_id)) AS finaleStartRound
    FROM brackets b WHERE b.bracket_id=? AND b.family_id=?${lock?' FOR UPDATE':''}`,[bracketId,familyId]);
  if(!brackets.length)throw fail(404,'Bracket not found.');const bracket=brackets[0];
  const [sessions]=await c.execute(`SELECT w.week_id AS weekId,w.week_number AS weekNumber,r.round_number AS roundNumber,r.name AS roundName,w.opens_at AS opensAt,w.closes_at AS closesAt,
    (SELECT COUNT(*) FROM matchups m WHERE m.bracket_id=w.bracket_id AND m.week_id=w.week_id) AS matchupCount,
    (SELECT COUNT(*) FROM matchups m WHERE m.bracket_id=w.bracket_id AND m.week_id=w.week_id AND m.winner_entry_id IS NOT NULL) AS decidedCount
    FROM bracket_weeks w JOIN bracket_rounds r ON r.bracket_id=w.bracket_id AND r.round_id=w.round_id WHERE w.bracket_id=? ORDER BY w.week_number${lock?' FOR UPDATE':''}`,[bracketId]);
  const effectiveNow=bracket.pausedAt?new Date(bracket.pausedAt):new Date();let priorPending=false;
  const rows=sessions.map(session=>{
    const isFinale=bracket.finaleStartRound!=null&&session.roundNumber>=bracket.finaleStartRound;
    const complete=Number(session.matchupCount)>0&&Number(session.decidedCount)===Number(session.matchupCount);
    const ended=session.closesAt&&new Date(session.closesAt)<=effectiveNow;
    const opened=session.opensAt&&new Date(session.opensAt)<=effectiveNow;
    const state=complete?'Decided':isFinale?'Finale':ended?'Awaiting results':opened&&!(bracket.duration==null&&priorPending)?bracket.pausedAt?'On hold':'Voting':'Upcoming';
    if(!complete)priorPending=true;
    return {...session,isFinale,state};
  });
  return {isDraft:bracket.storedStatus==='draft',effectiveAt:effectiveNow.toISOString(),bracketId:Number(bracketId),startAt:bracket.startAt,status:bracket.status,noTimer:bracket.duration==null,paused:!!bracket.pausedAt,revision:sessionRevision(sessions),sessions:rows};
}
export async function saveManagedSessions(c,bracketId,familyId,input) {
  const current=await getManagedSessions(c,bracketId,familyId,true);
  if(current.status==='complete')throw fail(409,'Sessions cannot be edited after the bracket is complete.');
  if(input?.revision!==current.revision)throw fail(409,'Session dates or results changed while this form was open. Close and reopen the bracket form before saving.');
  if(!current.sessions.length)throw fail(409,'Complete the bracket setup to generate its sessions first.');
  const changes=validateSessionDates(input.sessions,current.sessions,current.noTimer);
  // The first session anchors bracket activation and must always have a start.
  if(!changes[0].opensAt)throw fail(400,'The first session needs a start date.');
  for(const change of changes)await c.execute('UPDATE bracket_weeks SET opens_at=?,closes_at=? WHERE bracket_id=? AND week_id=?',[change.opensAt,change.closesAt,bracketId,change.weekId]);
  await c.execute("UPDATE brackets SET start_at=?,draft_settings=CASE WHEN status='draft' AND draft_settings IS NOT NULL THEN JSON_SET(draft_settings,'$.startAt',?) ELSE draft_settings END WHERE bracket_id=? AND family_id=?",[changes[0].opensAt,changes[0].opensAt.toISOString(),bracketId,familyId]);
  return getManagedSessions(c,bracketId,familyId);
}

export async function applySubmittedSessionSchedule(c,bracketId,familyId,schedule) {
  if(schedule===undefined)return;
  const current=await getManagedSessions(c,bracketId,familyId,true);
  if(!Array.isArray(schedule)||schedule.length!==current.sessions.length)throw fail(400,'The session schedule must match the selected bracket size and matchups per session.');
  const weeks=new Set();
  for(const row of schedule) {
    if(!row||!Number.isInteger(row.weekNumber)||weeks.has(row.weekNumber))throw fail(400,'Provide each session once in the schedule.');
    weeks.add(row.weekNumber);
  }
  const dates=current.sessions.map(session=>{
    const row=schedule.find(item=>item.weekNumber===Number(session.weekNumber));
    if(!row)throw fail(400,'The session schedule must include every voting week.');
    return {weekId:Number(session.weekId),opensAt:row.opensAt,closesAt:row.closesAt};
  });
  return saveManagedSessions(c,bracketId,familyId,{revision:current.revision,sessions:dates});
}
