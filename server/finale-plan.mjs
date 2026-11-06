export function parseFinalePlan(input,songCount,startAt) {
  if(!Object.hasOwn(input,'finaleAt')&&!Object.hasOwn(input,'finaleStartRound')) return undefined;
  const datePart=input.finaleAt?String(input.finaleAt).slice(0,10):null;
  const parts=datePart?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const finaleAt=parts?new Date(Number(parts[1]),Number(parts[2])-1,Number(parts[3])):null;
  if(datePart && (!parts || finaleAt.getFullYear()!==Number(parts[1]) || finaleAt.getMonth()!==Number(parts[2])-1 || finaleAt.getDate()!==Number(parts[3]))) throw Object.assign(new Error('Enter a valid Finale Date.'),{status:400});
  const finaleStartRound=input.finaleStartRound==null||input.finaleStartRound===''?null:Number(input.finaleStartRound);
  if(finaleAt===null&&finaleStartRound===null)return {finaleAt:null,finaleStartRound:null};
  if(!finaleAt||!Number.isFinite(finaleAt.getTime())||!Number.isInteger(finaleStartRound)||finaleStartRound<1||finaleStartRound>Math.log2(songCount)) throw Object.assign(new Error('Choose a finale date and a valid finale starting round, or leave both unset.'),{status:400});
  const start=new Date(startAt);
  const startDay=new Date(start.getFullYear(),start.getMonth(),start.getDate());
  if(startDay.getTime()>finaleAt.getTime())throw Object.assign(new Error('Finale date must be on or after the bracket start date.'),{status:400});
  return {finaleAt,finaleStartRound};
}
export function awaitingFinaleSql(b='b') {
  return `(${b}.finale_at IS NOT NULL AND ${b}.finale_start_round IS NOT NULL AND ${b}.status='active' AND ${b}.completed_at IS NULL AND ${b}.start_at<=COALESCE(${b}.paused_at,NOW())
    AND NOT EXISTS (SELECT 1 FROM bracket_finale_sessions fs WHERE fs.bracket_id=${b}.bracket_id AND fs.status IN ('active','paused','complete'))
    AND (${b}.finale_start_round=1 OR EXISTS (SELECT 1 FROM bracket_rounds er JOIN bracket_weeks ew ON ew.bracket_id=er.bracket_id AND ew.round_id=er.round_id JOIN matchups em ON em.bracket_id=ew.bracket_id AND em.week_id=ew.week_id WHERE er.bracket_id=${b}.bracket_id AND er.round_number<${b}.finale_start_round))
    AND NOT EXISTS (SELECT 1 FROM bracket_rounds pr JOIN bracket_weeks pw ON pw.bracket_id=pr.bracket_id AND pw.round_id=pr.round_id JOIN matchups pm ON pm.bracket_id=pw.bracket_id AND pm.week_id=pw.week_id WHERE pr.bracket_id=${b}.bracket_id AND pr.round_number<${b}.finale_start_round AND pm.winner_entry_id IS NULL))`;
}
