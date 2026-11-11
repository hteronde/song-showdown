import { isolateBracketSong } from './bracket-song-ownership.mjs';
const minute=value=>value?Math.floor(new Date(value).getTime()/60000):null;
export function canPreserveBracketStructure(bracket,entries,input) {
  return (bracket.seeding_size??null)===(input.seedingSize===undefined?bracket.seeding_size??null:input.seedingSize)
    && (!(bracket.seeding_size??input.seedingSize) || entries.every((entry,i)=>Number(entry.assigned_seed)===Number(input.songs?.[i]?.assignedSeed)))
    && (bracket.randomization_mode??'none')===(input.randomizationMode??bracket.randomization_mode??'none') && entries.length===Number(input.songCount) && Number(bracket.songs_per_session)===Number(input.songsPerSession)
    && minute(bracket.start_at)===minute(input.startAt)
    && entries.every((entry,i)=>input.songs?.[i]?.bracketSongId!=null
      ? Number(entry.bracket_song_id)===Number(input.songs[i].bracketSongId)
      : entry.title===input.titles[i]);
}
export function shiftRemainingSessions(weeks,effectiveNow,durationMinutes) {
  let previousOldClose=null,previousNewClose=null;
  return weeks.map(week=>{
    const oldOpen=week.opens_at==null?null:new Date(week.opens_at),oldClose=week.closes_at==null?null:new Date(week.closes_at);
    if(Number(week.decidedCount)>0 || (oldClose && oldClose<=effectiveNow)) return null;
    if(durationMinutes===null) {
      const opensAt=previousNewClose==null?(oldOpen??effectiveNow):null;
      previousNewClose=new Date(effectiveNow);
      return {weekId:week.week_id,opensAt,closesAt:null};
    }
    const gap=previousOldClose==null||oldOpen==null?0:Math.max(0,oldOpen-previousOldClose);
    const opensAt=previousNewClose==null?(oldOpen??effectiveNow):new Date(previousNewClose.getTime()+gap);
    const closesAt=new Date(Math.max(opensAt.getTime()+durationMinutes*60000,effectiveNow.getTime()+1000));
    previousOldClose=oldClose;previousNewClose=closesAt;
    return {weekId:week.week_id,opensAt,closesAt};
  }).filter(Boolean);
}
export async function updateSongDetailsInPlace(c,bracketId,entries,songs,seeds) {
  for(let i=0;i<entries.length;i++) {
    const song=songs?.[i];
    await c.execute('UPDATE bracket_songs SET position=? WHERE bracket_id=? AND bracket_song_id=?',[i+1,bracketId,entries[i].bracket_song_id]);
    if(song) entries[i].song_id=await isolateBracketSong(c,bracketId,entries[i].song_id);
    if(song) await c.execute('UPDATE songs SET title=?,album=?,year=?,category=?,youtube_url=?,spotify_url=?,album_cover_url=? WHERE song_id=?',[song.title.trim(),song.album?.trim()||null,song.year??null,song.category?.trim()||null,song.youtubeUrl?.trim()||null,song.spotifyUrl?.trim()||null,song.albumCoverUrl?.trim()||null,entries[i].song_id]);
    if(song && Object.hasOwn(song,'albumId')) await c.execute('UPDATE bracket_songs SET bracket_album_id=? WHERE bracket_id=? AND bracket_song_id=?',[song.albumId??null,bracketId,entries[i].bracket_song_id]);
    if(Number(entries[i].seed_number)!==seeds[i]) await c.execute('UPDATE bracket_songs SET seed_number=? WHERE bracket_id=? AND bracket_song_id=?',[seeds[i],bracketId,entries[i].bracket_song_id]);
  }
}
export async function applyLiveBracketEdit(c,bracket,entries,input,seeds) {
  const bracketId=bracket.bracket_id;
  const [members]=await c.execute(`SELECT user_id FROM users WHERE family_id=? AND user_id IN (${input.participantIds.map(()=>'?').join(',')})`,[bracket.family_id,...input.participantIds]);
  if(members.length!==input.participantIds.length) throw Object.assign(new Error('One or more participants are not members of your family.'),{status:400});
  await updateSongDetailsInPlace(c,bracketId,entries,input.songs,seeds);
  if(Number(bracket.session_duration_minutes)!==Number(input.sessionDurationMinutes)) {
    const [[clock]]=await c.execute('SELECT COALESCE(paused_at,NOW()) AS effectiveNow FROM brackets WHERE bracket_id=?',[bracketId]);
    const [weeks]=await c.execute('SELECT week_id,opens_at,closes_at,(SELECT COUNT(*) FROM matchups m WHERE m.bracket_id=bracket_weeks.bracket_id AND m.week_id=bracket_weeks.week_id AND m.winner_entry_id IS NOT NULL) AS decidedCount FROM bracket_weeks WHERE bracket_id=? ORDER BY week_number FOR UPDATE',[bracketId]);
    for(const week of shiftRemainingSessions(weeks,new Date(clock.effectiveNow),input.sessionDurationMinutes===null?null:Number(input.sessionDurationMinutes))) await c.execute('UPDATE bracket_weeks SET opens_at=?,closes_at=? WHERE bracket_id=? AND week_id=?',[week.opensAt,week.closesAt,bracketId,week.weekId]);
  }
  await c.execute('UPDATE brackets SET title=?,artist=?,session_duration_minutes=?,tiebreaker_option=?,anonymous=? WHERE bracket_id=?',[input.title.trim(),input.artist.trim(),input.sessionDurationMinutes,input.tiebreakerOption,input.anonymous??!!bracket.anonymous,bracketId]);
  if(Object.hasOwn(input,'finaleAt')||Object.hasOwn(input,'finaleStartRound')) await c.execute('UPDATE brackets SET finale_at=?,finale_start_round=? WHERE bracket_id=?',[input.finaleAt??null,input.finaleStartRound??null,bracketId]);
  await c.execute(`DELETE FROM bracket_members WHERE bracket_id=? AND user_id NOT IN (${input.participantIds.map(()=>'?').join(',')})`,[bracketId,...input.participantIds]);
  for(const userId of input.participantIds) await c.execute('INSERT IGNORE INTO bracket_members (bracket_id,family_id,user_id,non_finale_participant,finale_participant,invitation_status) VALUES (?,?,?,TRUE,TRUE,\'pending\')',[bracketId,bracket.family_id,userId]);
}
