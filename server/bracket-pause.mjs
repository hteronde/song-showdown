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
