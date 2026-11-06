const invalid=message=>Object.assign(new Error(message),{status:400});
export function validateAlbum(album) {
  if(!album || typeof album.title!=='string' || !album.title.trim() || album.title.trim().length>200) throw invalid('Album title is required (up to 200 characters).');
  if(album.year!=null && (!Number.isInteger(album.year)||album.year<1||album.year>9999)) throw invalid('Album year must be a whole number from 1 to 9999.');
  if(album.albumCoverUrl!=null && (typeof album.albumCoverUrl!=='string'||album.albumCoverUrl.length>2048||(album.albumCoverUrl.trim()&&!/^https?:\/\/[^\s]+$/i.test(album.albumCoverUrl.trim())))) throw invalid('Enter a valid HTTP or HTTPS album cover URL.');
  return {title:album.title.trim(),year:album.year??null,albumCoverUrl:album.albumCoverUrl?.trim()||null};
}
export async function getBracketAlbums(c,bracketId) {
  const [rows]=await c.execute('SELECT bracket_album_id AS albumId,title,year,album_cover_url AS albumCoverUrl FROM bracket_albums WHERE bracket_id=? ORDER BY year IS NULL,year,title',[bracketId]);
  return rows;
}
export async function resolveSongAlbums(c,bracketId,songs) {
  if(!Array.isArray(songs)) return songs;
  if(!songs.some(song=>song&&Object.hasOwn(song,'albumId'))) return songs;
  const albums=await getBracketAlbums(c,bracketId);
  return songs.map(song=>{
    if(!Object.hasOwn(song,'albumId')) return song; // Existing import clients retain their metadata.
    if(song.albumId==null) return {...song,album:'',year:null,albumCoverUrl:''};
    if(!Number.isSafeInteger(song.albumId)) throw invalid('Select a valid album from this bracket.');
    const album=albums.find(album=>Number(album.albumId)===song.albumId);
    if(!album) throw invalid('The selected album does not belong to this bracket.');
    return {...song,album:album.title,year:album.year,albumCoverUrl:album.albumCoverUrl||''};
  });
}
export async function saveBracketAlbum(c,{bracketId,albumId,familyId,userId,input}) {
  const album=validateAlbum(input.album);
  if(bracketId) {
    const [rows]=await c.execute('SELECT bracket_id FROM brackets WHERE bracket_id=? AND family_id=? FOR UPDATE',[bracketId,familyId]);
    if(!rows.length) throw Object.assign(new Error('Bracket not found.'),{status:404});
  } else {
    if(!String(input.title||'').trim()||!String(input.artist||'').trim()) throw invalid('Enter the bracket title and artist before saving albums.');
    const [created]=await c.execute("INSERT INTO brackets (family_id,created_by_user_id,title,artist,status) VALUES (?,?,?,?,'draft')",[familyId,userId,input.title.trim(),input.artist.trim()]);
    bracketId=Number(created.insertId);
  }
  const [duplicates]=await c.execute('SELECT bracket_album_id FROM bracket_albums WHERE bracket_id=? AND title=? AND bracket_album_id<>?',[bracketId,album.title,albumId||0]);
  if(duplicates.length) throw invalid('This bracket already has an album with that title.');
  if(albumId) {
    const [rows]=await c.execute('SELECT bracket_album_id FROM bracket_albums WHERE bracket_id=? AND bracket_album_id=?',[bracketId,albumId]);
    if(!rows.length) throw Object.assign(new Error('Album not found in this bracket.'),{status:404});
    await c.execute('UPDATE bracket_albums SET title=?,year=?,album_cover_url=? WHERE bracket_id=? AND bracket_album_id=?',[album.title,album.year,album.albumCoverUrl,bracketId,albumId]);
  } else {
    const [created]=await c.execute('INSERT INTO bracket_albums (bracket_id,title,year,album_cover_url) VALUES (?,?,?,?)',[bracketId,album.title,album.year,album.albumCoverUrl]);
    albumId=Number(created.insertId);
  }
  return {bracketId,albumId,albums:await getBracketAlbums(c,bracketId)};
}

export async function removeBracketAlbum(c,{bracketId,albumId,familyId}) {
  const [brackets]=await c.execute('SELECT bracket_id FROM brackets WHERE bracket_id=? AND family_id=? FOR UPDATE',[bracketId,familyId]);
  if(!brackets.length)throw Object.assign(new Error('Bracket not found.'),{status:404});
  const [albums]=await c.execute('SELECT bracket_album_id FROM bracket_albums WHERE bracket_id=? AND bracket_album_id=? FOR UPDATE',[bracketId,albumId]);
  if(!albums.length)throw Object.assign(new Error('Album not found.'),{status:404});
  const [songs]=await c.execute(`SELECT bs.bracket_song_id AS entryId,bs.song_id AS songId,
    (SELECT COUNT(*) FROM bracket_songs other WHERE other.song_id=bs.song_id AND other.bracket_song_id<>bs.bracket_song_id) AS shared
    FROM bracket_songs bs JOIN songs s ON s.song_id=bs.song_id WHERE bs.bracket_id=? AND bs.bracket_album_id=? FOR UPDATE`,[bracketId,albumId]);
  for(const song of songs) {
    if(Number(song.shared)>0) {
      // Detach shared catalog metadata before clearing it so other brackets are unchanged.
      const [copy]=await c.execute('INSERT INTO songs (artist,title,category,youtube_url,spotify_url) SELECT artist,title,category,youtube_url,spotify_url FROM songs WHERE song_id=?',[song.songId]);
      await c.execute('UPDATE bracket_songs SET song_id=?,bracket_album_id=NULL WHERE bracket_id=? AND bracket_song_id=?',[copy.insertId,bracketId,song.entryId]);
    } else {
      await c.execute('UPDATE songs SET album=NULL,year=NULL,album_cover_url=NULL WHERE song_id=?',[song.songId]);
      await c.execute('UPDATE bracket_songs SET bracket_album_id=NULL WHERE bracket_id=? AND bracket_song_id=?',[bracketId,song.entryId]);
    }
  }
  await c.execute('DELETE FROM bracket_albums WHERE bracket_id=? AND bracket_album_id=?',[bracketId,albumId]);
  return {removed:true,albums:await getBracketAlbums(c,bracketId),affectedSongIds:songs.map(song=>Number(song.entryId))};
}
