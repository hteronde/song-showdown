const fail=message=>Object.assign(new Error(message),{status:400});
export function validateSessionPlaylists(input) {
  if(!Array.isArray(input))throw fail('Provide a list of bracket playlists.');
  return input.map(row=>{
    if(!row||(row.weekNumber!==null&&(!Number.isSafeInteger(row.weekNumber)||row.weekNumber<1)))throw fail('Choose a week or the entire bracket for each playlist.');
    if((row.playlistName!=null && typeof row.playlistName!=='string')||(row.playlistUrl!=null && typeof row.playlistUrl!=='string'))throw fail('Enter a valid playlist name and URL.');
    const playlistName=typeof row.playlistName==='string'?row.playlistName.trim():'',playlistUrl=typeof row.playlistUrl==='string'?row.playlistUrl.trim():'';
    if(playlistName.length>160||playlistUrl.length>2048)throw fail('Playlist names must be under 161 characters and links under 2049 characters.');
    if(playlistUrl){try{const url=new URL(playlistUrl);if(!['https:','http:'].includes(url.protocol))throw new Error();}catch{throw fail('Enter a valid HTTP or HTTPS playlist URL.');}}
    return {weekNumber:row.weekNumber,playlistName:playlistName||(row.weekNumber===null?'Bracket playlist':`Week ${row.weekNumber} playlist`),playlistUrl};
  });
}
export async function getSessionPlaylists(c,bracketId) {
  const [rows]=await c.execute(`SELECT w.week_number AS weekNumber,p.playlist_name AS playlistName,p.playlist_url AS playlistUrl
    FROM bracket_playlists p LEFT JOIN bracket_weeks w ON w.bracket_id=p.bracket_id AND w.week_id=p.week_id WHERE p.bracket_id=? ORDER BY w.week_number,p.playlist_id`,[bracketId]);
  return rows;
}
export async function saveSessionPlaylists(c,bracketId,input) {
  if(input===undefined)return;
  const rows=validateSessionPlaylists(input).filter(row=>row.playlistUrl);
  const [weeks]=await c.execute('SELECT week_id,week_number FROM bracket_weeks WHERE bracket_id=?',[bracketId]);
  const weekIds=new Map(weeks.map(week=>[Number(week.week_number),week.week_id]));
  const assignments=rows.map(row=>{
    const weekId=row.weekNumber===null?null:weekIds.get(row.weekNumber);
    if(weekId===undefined)throw fail(`Week ${row.weekNumber} no longer exists. Review the playlist assignments.`);
    return [weekId,row.playlistName,row.playlistUrl];
  });

  const [existing]=await c.execute('SELECT playlist_id,week_id,playlist_name,playlist_url FROM bracket_playlists WHERE bracket_id=? FOR UPDATE',[bracketId]);
  const existingIds=new Map();
  for(const row of existing){
    const key=JSON.stringify([row.week_id,row.playlist_name,row.playlist_url]);
    if(!existingIds.has(key))existingIds.set(key,[]);
    existingIds.get(key).push(row.playlist_id);
  }
  for(const assignment of assignments){
    const retainedId=existingIds.get(JSON.stringify(assignment))?.pop();
    if(retainedId===undefined)await c.execute('INSERT INTO bracket_playlists (bracket_id,week_id,playlist_name,playlist_url) VALUES (?,?,?,?)',[bracketId,...assignment]);
  }
  for(const ids of existingIds.values()){
    for(const id of ids)await c.execute('DELETE FROM bracket_playlists WHERE bracket_id=? AND playlist_id=?',[bracketId,id]);
  }
}

// Later-round entry IDs can be placeholders until their feeder matchup is decided.
export async function getSessionPlaylistMatchups(c,bracketId) {
  const [rows]=await c.execute(`SELECT w.week_number AS weekNumber,m.matchup_number AS matchupNumber,
    CASE WHEN (b.randomization_mode<>'each_round' OR r.round_number=1 OR r.randomized_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM matchups f WHERE f.bracket_id=m.bracket_id AND f.next_matchup_id=m.matchup_id AND f.next_slot='A' AND f.winner_entry_id IS NULL) THEN sa.title ELSE NULL END AS songA,
    CASE WHEN (b.randomization_mode<>'each_round' OR r.round_number=1 OR r.randomized_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM matchups f WHERE f.bracket_id=m.bracket_id AND f.next_matchup_id=m.matchup_id AND f.next_slot='B' AND f.winner_entry_id IS NULL) THEN sb.title ELSE NULL END AS songB
    FROM matchups m JOIN brackets b ON b.bracket_id=m.bracket_id
    JOIN bracket_weeks w ON w.week_id=m.week_id AND w.bracket_id=m.bracket_id
    JOIN bracket_rounds r ON r.round_id=w.round_id
    LEFT JOIN bracket_songs a ON a.bracket_song_id=m.song_a_entry_id LEFT JOIN songs sa ON sa.song_id=a.song_id
    LEFT JOIN bracket_songs z ON z.bracket_song_id=m.song_b_entry_id LEFT JOIN songs sb ON sb.song_id=z.song_id
    WHERE m.bracket_id=? ORDER BY w.week_number,m.matchup_number`,[bracketId]);
  return rows;
}

export async function updateBracketSessionPlaylists(c,bracketId,familyId,input) {
  const [brackets]=await c.execute('SELECT bracket_id FROM brackets WHERE bracket_id=? AND family_id=? FOR UPDATE',[bracketId,familyId]);
  if(!brackets.length)throw Object.assign(new Error('Bracket not found.'),{status:404});
  if(input===undefined)throw fail('Provide a list of bracket playlists.');
  await saveSessionPlaylists(c,bracketId,input);
  return {sessionPlaylists:await getSessionPlaylists(c,bracketId)};
}
