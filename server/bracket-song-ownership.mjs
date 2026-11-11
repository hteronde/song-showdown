// A song reused by another bracket must not be changed through this bracket's editor.
export async function isolateBracketSong(c, bracketId, songId) {
  const [shared] = await c.execute('SELECT bracket_song_id FROM bracket_songs WHERE song_id=? AND bracket_id<>? LIMIT 1',[songId,bracketId]);
  if (!shared.length) return songId;
  const [copy] = await c.execute(`INSERT INTO songs (artist,title,album,year,category,youtube_url,spotify_url,album_cover_url)
    SELECT artist,title,album,year,category,youtube_url,spotify_url,album_cover_url FROM songs WHERE song_id=?`,[songId]);
  await c.execute('UPDATE bracket_songs SET song_id=? WHERE bracket_id=? AND song_id=?',[copy.insertId,bracketId,songId]);
  return copy.insertId;
}
