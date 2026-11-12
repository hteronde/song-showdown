import { isolateBracketSong } from './bracket-song-ownership.mjs';
import { getSongOrderLocks, assertSongOrderUnlocked } from './song-order-locks.mjs';
import { validateAssignedSeeds, seededOrder } from './bracket-seeding.mjs';
import { shuffled } from './round-randomization.mjs';
import { resolveSongAlbums } from './bracket-albums.mjs';
import { updateSongDetailsInPlace } from './live-bracket-edit.mjs';
import { assignSongSeeds } from './song-seeds.mjs';

export function validateBracketSongs(songs) {
  if (!Array.isArray(songs) || songs.length > 128) throw new Error('Provide up to 128 songs.');
  for (const song of songs) {
    if (!song || typeof song.title !== 'string' || !song.title.trim() || song.title.length > 200) throw new Error('Each song needs a title of up to 200 characters.');
    for (const [key, max] of Object.entries({category:255,album:200,youtubeUrl:2048,spotifyUrl:2048,albumCoverUrl:2048})) {
      if (song[key] != null && (typeof song[key] !== 'string' || song[key].length > max)) throw new Error('Invalid song details.');
    }
    if (song.year != null && (!Number.isInteger(song.year) || song.year < 1 || song.year > 9999)) throw new Error('Enter a valid year.');
    for (const key of ['youtubeUrl','spotifyUrl','albumCoverUrl']) if (song[key] && !/^https?:\/\/[^\s]+$/i.test(song[key])) throw new Error('Song links must use HTTP or HTTPS.');
  }
  if (new Set(songs.map(song => song.title.trim().toLowerCase())).size !== songs.length) throw new Error('Song titles must be unique within the bracket.');
  return assignSongSeeds(songs);
}

export async function saveBracketSongs(connection, { bracketId, familyId, userId, input }) {
  let seeds;
  if (!Array.isArray(input.songs)) throw new Error('Provide a list of songs.');
  if (input.metadataOnly && !bracketId) throw new Error('Save the bracket before editing song details.');
  // Validate metadata first; legacy regional seed numbers are independent of list position.
  validateBracketSongs(input.songs.map(song=>({...song,seed:null})));
  let bracket;
  if (bracketId) {
    const [rows] = await connection.execute('SELECT * FROM brackets WHERE bracket_id=? AND family_id=? FOR UPDATE',[bracketId,familyId]);
    if (!rows.length) throw Object.assign(new Error('Bracket not found.'),{status:404});
    bracket = rows[0];
  } else {
    if (!String(input.title||'').trim() || !String(input.artist||'').trim()) throw new Error('Enter the bracket title and artist before saving songs.');
    const [created] = await connection.execute("INSERT INTO brackets (family_id,created_by_user_id,title,artist,status) VALUES (?,?,?,?,'draft')",[familyId,userId,input.title.trim(),input.artist.trim()]);
    bracketId = created.insertId;
    bracket = { artist: input.artist.trim(), start_at: null };
  }
  input={...input,songs:await resolveSongAlbums(connection,bracketId,input.songs)};
  const [[activity]] = await connection.execute('SELECT (SELECT COUNT(*) FROM votes WHERE bracket_id=?) + (SELECT COUNT(*) FROM bracket_finale_sessions WHERE bracket_id=?) + (SELECT COUNT(*) FROM matchups WHERE bracket_id=? AND winner_entry_id IS NOT NULL) AS total',[bracketId,bracketId,bracketId]);
  const [existing] = await connection.execute('SELECT bracket_song_id,song_id,seed_number,assigned_seed FROM bracket_songs WHERE bracket_id=? ORDER BY position,bracket_song_id',[bracketId]);
  if(input.metadataOnly) {
    // Never let a stale editor or supplied reset flag rebuild a live tournament.
    if(!existing.length || existing.length!==input.songs.length || !existing.every((entry,i)=>Number(entry.bracket_song_id)===input.songs[i].bracketSongId))
      throw Object.assign(new Error('The bracket song list changed. Reopen the bracket and try editing the song again.'),{status:409});
    seeds=existing.map(entry=>Number(entry.seed_number));
    await updateSongDetailsInPlace(connection,bracketId,existing,input.songs,seeds,{preserveStructure:true});
    return {bracketId,songs:input.songs.map((song,i)=>({...song,seed:seeds[i],assignedSeed:existing[i].assigned_seed??null})),needsSetup:false};
  }
  const orderedExisting=input.songs.map(song=>existing.find(entry=>Number(entry.bracket_song_id)===song.bracketSongId));
  const sameEntries=existing.length===input.songs.length && existing.length>0 && orderedExisting.every(Boolean) && new Set(input.songs.map(song=>song.bracketSongId)).size===existing.length;
  seeds=sameEntries && input.songs.every((song,i)=>song.seed==null || Number(song.seed)===Number(orderedExisting[i].seed_number))?orderedExisting.map(entry=>Number(entry.seed_number)):validateBracketSongs(input.songs);
  if(existing.length===input.songs.length && existing.length>0 && existing.every((entry,i)=>Number(entry.bracket_song_id)===input.songs[i].bracketSongId)) {
    await updateSongDetailsInPlace(connection,bracketId,existing,input.songs,seeds);
    return {bracketId,songs:input.songs.map((song,i)=>({...song,position:i+1,seed:seeds[i],assignedSeed:existing[i].assigned_seed??null})),needsSetup:false};
  }
  if (sameEntries && (bracket.start_at || Number(activity.total))) {
    assertSongOrderUnlocked(existing,input.songs,await getSongOrderLocks(connection,bracketId));
  }
  if (Number(activity.total) && input.resetHistory!==true) throw Object.assign(new Error('Adding, removing, or reordering songs requires rebuilding the tournament. This will clear all recorded votes, results, and Finale Mode progress. Editing an existing song keeps voting history.'),{status:409,requiresReset:true});
  if(input.resetHistory===true) {
    await connection.execute('DELETE FROM votes WHERE bracket_id=?',[bracketId]);
    await connection.execute('DELETE FROM bracket_finale_sessions WHERE bracket_id=?',[bracketId]);
    await connection.execute("UPDATE brackets SET start_at=NULL,paused_at=NULL,completed_at=NULL,status='draft' WHERE bracket_id=?",[bracketId]);
    bracket.start_at=null;
  }
  // The existing schedule defines field size. Keep weeks and playlist links intact.
  const [weeks] = await connection.execute('SELECT w.week_id,r.round_number FROM bracket_weeks w JOIN bracket_rounds r ON r.round_id=w.round_id AND r.bracket_id=w.bracket_id WHERE w.bracket_id=? ORDER BY r.round_number,w.week_number',[bracketId]);
  const roundCount = Math.max(0,...weeks.map(week => Number(week.round_number)));
  let fieldComplete = roundCount > 0 && input.songs.length === 2 ** roundCount;
  await connection.execute('UPDATE matchups SET next_matchup_id=NULL,next_slot=NULL WHERE bracket_id=?',[bracketId]);
  await connection.execute('DELETE FROM matchups WHERE bracket_id=?',[bracketId]);
  if(!sameEntries)await connection.execute('DELETE FROM bracket_songs WHERE bracket_id=?',[bracketId]);
  else await updateSongDetailsInPlace(connection,bracketId,orderedExisting,input.songs,seeds);
  const entries = [], savedSongs = [];
  for (let i=0;i<input.songs.length;i++) {
    const song=input.songs[i];
    if(sameEntries) {
      const entry=orderedExisting[i];entries.push(Number(entry.bracket_song_id));
      savedSongs.push({...song,position:i+1,seed:seeds[i],assignedSeed:entry.assigned_seed??null,bracketSongId:Number(entry.bracket_song_id)});
      continue;
    }
    const previous=existing.find(entry => Number(entry.bracket_song_id) === song.bracketSongId);
    let songId=previous?.song_id;
    if (!songId) {
      const [matches]=await connection.execute('SELECT song_id FROM songs WHERE artist=? AND title=? LIMIT 1',[bracket.artist,song.title.trim()]);
      songId=matches[0]?.song_id;
    }
    const metadata=[song.title.trim(),song.album?.trim()||null,song.year??null,song.category?.trim()||null,song.youtubeUrl?.trim()||null,song.spotifyUrl?.trim()||null,song.albumCoverUrl?.trim()||null];
    if (songId) songId=await isolateBracketSong(connection,bracketId,songId);
    if (songId) await connection.execute('UPDATE songs SET title=?,album=?,year=?,category=?,youtube_url=?,spotify_url=?,album_cover_url=? WHERE song_id=?',[...metadata,songId]);
    else {
      const [created]=await connection.execute('INSERT INTO songs (title,album,year,category,youtube_url,spotify_url,album_cover_url,artist) VALUES (?,?,?,?,?,?,?,?)',[...metadata,bracket.artist]);
      songId=created.insertId;
    }
    const [entry]=await connection.execute('INSERT INTO bracket_songs (bracket_id,region_number,song_id,seed_number,bracket_album_id,assigned_seed,position) VALUES (?,?,?,?,?,?,?)',[bracketId,Math.floor(i/16)+1,songId,seeds[i],song.albumId??null,previous?.assigned_seed??null,i+1]);
    entries.push(Number(entry.insertId)); savedSongs.push({...song,position:i+1,seed:seeds[i],assignedSeed:previous?.assigned_seed??null,bracketSongId:Number(entry.insertId)});
  }
  if (fieldComplete && bracket.seeding_size) {
    try {validateAssignedSeeds(savedSongs,Number(bracket.seeding_size));} catch {fieldComplete=false;}
  }
  if (fieldComplete) {
    const ranks=new Map(entries.map((entry,i)=>[entry,savedSongs[i].assignedSeed]));
    let previous = [], anchors=bracket.seeding_size ? seededOrder(entries,entry=>ranks.get(entry),!!bracket.randomization_mode&&bracket.randomization_mode!=='none') : bracket.randomization_mode && bracket.randomization_mode!=='none'?shuffled(entries):entries;
    for (let round=1;round<=roundCount;round++) {
      const roundWeeks=weeks.filter(week => Number(week.round_number)===round);
      const ids=[], nextAnchors=[];
      for (let game=0;game<anchors.length/2;game++) {
        const week=roundWeeks[Math.min(Math.floor(game/Number(bracket.songs_per_session)),roundWeeks.length-1)];
        const [match]=await connection.execute('INSERT INTO matchups (bracket_id,week_id,matchup_number,song_a_entry_id,song_b_entry_id) VALUES (?,?,?,?,?)',[bracketId,week.week_id,game+1,anchors[game*2],anchors[game*2+1]]);
        ids.push(Number(match.insertId)); nextAnchors.push(anchors[game*2]);
      }
      for (let i=0;i<previous.length;i++) await connection.execute('UPDATE matchups SET next_matchup_id=?,next_slot=? WHERE matchup_id=?',[ids[Math.floor(i/2)],i%2===0?'A':'B',previous[i]]);
      previous=ids; anchors=nextAnchors;
    }
  }
  if(fieldComplete && bracket.randomization_mode && bracket.randomization_mode!=='none') await connection.execute('UPDATE bracket_rounds SET randomized_at=CASE WHEN round_number=1 THEN NOW(6) ELSE NULL END WHERE bracket_id=?',[bracketId]);
  await connection.execute("UPDATE brackets SET status=?,completed_at=NULL WHERE bracket_id=?",[fieldComplete && bracket.start_at ? 'active':'draft',bracketId]);
  return { bracketId, songs:savedSongs, needsSetup:!fieldComplete || !bracket.start_at };
}
