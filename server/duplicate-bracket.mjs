import {getSessionPlaylists} from './session-playlists.mjs';
import {parseDraftSettings,prepareBracketDraft} from './bracket-drafts.mjs';
export function duplicateBracketTitle(title) {return `${Array.from(title).slice(0,155).join('').trimEnd()} copy`;}
export async function duplicateBracket(c,{bracketId,familyId,userId,input={}}) {
  const [rows]=await c.execute('SELECT * FROM brackets WHERE bracket_id=? AND family_id=? FOR UPDATE',[bracketId,familyId]);
  if(!rows.length)throw Object.assign(new Error('Bracket not found.'),{status:404});
  const source=rows[0],stored=source.status==='draft'?parseDraftSettings(source.draft_settings):{};
  const [[rounds]]=await c.execute('SELECT MAX(round_number) AS roundCount FROM bracket_rounds WHERE bracket_id=?',[bracketId]);
  const [entries]=await c.execute(`SELECT bs.bracket_song_id AS bracketSongId,bs.bracket_album_id AS albumId,bs.region_number AS region,bs.seed_number AS seed,bs.assigned_seed AS assignedSeed,
    s.artist AS songArtist,s.title,s.category,s.youtube_url AS youtubeUrl,s.spotify_url AS spotifyUrl,
    COALESCE(a.title,s.album) AS album,CASE WHEN a.bracket_album_id IS NOT NULL THEN a.year ELSE s.year END AS year,
    CASE WHEN a.bracket_album_id IS NOT NULL THEN a.album_cover_url ELSE s.album_cover_url END AS albumCoverUrl
    FROM bracket_songs bs JOIN songs s ON s.song_id=bs.song_id LEFT JOIN bracket_albums a ON a.bracket_id=bs.bracket_id AND a.bracket_album_id=bs.bracket_album_id
    WHERE bs.bracket_id=? ORDER BY bs.position,bs.bracket_song_id`,[bracketId]);
  const [weeks]=await c.execute('SELECT week_number AS weekNumber,opens_at AS opensAt,closes_at AS closesAt FROM bracket_weeks WHERE bracket_id=? ORDER BY week_number',[bracketId]);
  const defaults={sessionPlaylists:await getSessionPlaylists(c,bracketId),title:source.title,artist:source.artist,logoUrl:source.logo_url,songCount:rounds.roundCount?2**Number(rounds.roundCount):Math.max(16,2**Math.ceil(Math.log2(entries.length||1))),participantIds:[],startAt:source.start_at,songsPerSession:Number(source.songs_per_session),sessionDurationMinutes:source.session_duration_minutes,finaleAt:source.finale_at,finaleStartRound:source.finale_start_round,seedingSize:source.seeding_size,randomizationMode:source.randomization_mode,tiebreakerOption:source.tiebreaker_option,anonymous:!!source.anonymous,...(weeks.length?{sessionSchedule:weeks}:{})};
  const prepared=prepareBracketDraft({...defaults,...stored,...input,participantIds:[],participantRoles:{}});
  const title=duplicateBracketTitle(prepared.title);
  const [created]=await c.execute(`INSERT INTO brackets (family_id,created_by_user_id,title,artist,logo_url,bracket_year,finale_at,finale_start_round,anonymous,seeding_size,randomization_mode,songs_per_session,session_duration_minutes,tiebreaker_option,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`,[familyId,userId,title,prepared.artist,source.logo_url,source.bracket_year,source.finale_at,source.finale_start_round,source.anonymous,source.seeding_size,source.randomization_mode,source.songs_per_session,source.session_duration_minutes,source.tiebreaker_option]);
  const copyId=Number(created.insertId),albumIds=new Map();
  const [albums]=await c.execute('SELECT bracket_album_id,title,year,album_cover_url FROM bracket_albums WHERE bracket_id=? ORDER BY bracket_album_id',[bracketId]);
  for(const album of albums) {
    const [result]=await c.execute('INSERT INTO bracket_albums (bracket_id,title,year,album_cover_url) VALUES (?,?,?,?)',[copyId,album.title,album.year,album.album_cover_url]);
    albumIds.set(Number(album.bracket_album_id),Number(result.insertId));
  }
  const copiedSongs=[];
  for(const song of entries) {
    // Copies have independent song records so editing the duplicate cannot change its source.
    const [record]=await c.execute('INSERT INTO songs (artist,title,album,year,category,youtube_url,spotify_url,album_cover_url) VALUES (?,?,?,?,?,?,?,?)',[song.songArtist,song.title,song.album,song.year,song.category,song.youtubeUrl,song.spotifyUrl,song.albumCoverUrl]);
    const albumId=song.albumId==null?null:albumIds.get(Number(song.albumId));
    const [entry]=await c.execute('INSERT INTO bracket_songs (bracket_id,region_number,song_id,seed_number,assigned_seed,bracket_album_id,position) VALUES (?,?,?,?,?,?,?)',[copyId,song.region,record.insertId,song.seed,song.assignedSeed,albumId,copiedSongs.length+1]);
    const staged=Array.isArray(prepared.settings.songs)?prepared.settings.songs.find(item=>item.bracketSongId!=null?Number(item.bracketSongId)===Number(song.bracketSongId):item.title===song.title):null;
    copiedSongs.push({position:copiedSongs.length+1,bracketSongId:Number(entry.insertId),albumId,title:song.title,category:song.category??'',album:song.album??'',year:song.year,youtubeUrl:song.youtubeUrl??'',spotifyUrl:song.spotifyUrl??'',albumCoverUrl:song.albumCoverUrl??'',seed:song.seed,assignedSeed:staged&&Object.hasOwn(staged,'assignedSeed')?staged.assignedSeed:song.assignedSeed});
  }
  await c.execute('UPDATE brackets SET draft_settings=? WHERE bracket_id=?',[JSON.stringify({...prepared.settings,songs:copiedSongs}),copyId]);
  return {bracketId:copyId,title,status:'draft'};
}
