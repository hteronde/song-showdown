export async function getSongOrderLocks(connection, bracketId) {
  const [rows] = await connection.execute(`SELECT m.song_a_entry_id AS songA, m.song_b_entry_id AS songB
    FROM matchups m
    JOIN bracket_weeks w ON w.week_id=m.week_id AND w.bracket_id=m.bracket_id
    JOIN brackets b ON b.bracket_id=m.bracket_id
    WHERE m.bracket_id=? AND (
      b.status='complete' OR b.completed_at IS NOT NULL OR m.winner_entry_id IS NOT NULL
      OR (b.status<>'draft' AND w.opens_at<=COALESCE(b.paused_at,NOW(6)))
      OR EXISTS (SELECT 1 FROM votes v WHERE v.matchup_id=m.matchup_id AND v.bracket_id=m.bracket_id))`, [bracketId]);
  return new Set(rows.flatMap(row => [Number(row.songA), Number(row.songB)]));
}

export function assertSongOrderUnlocked(existing, songs, lockedIds) {
  if (existing.some((entry, index) => lockedIds.has(Number(entry.bracket_song_id)) && Number(songs[index]?.bracketSongId) !== Number(entry.bracket_song_id))) {
    throw Object.assign(new Error('Songs in current or past matchups cannot be reordered. Reload the bracket to see the latest locked songs.'), { status: 409 });
  }
}
