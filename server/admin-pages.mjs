import {validateBracketSongs} from './bracket-song-save.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function memberInput(input) {
 const displayName=String(input.displayName??'').trim(),email=String(input.email??'').trim().toLowerCase(),role=input.role;
 if(!displayName||displayName.length>120||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||!['owner','member'].includes(role))throw fail(400,'Enter a valid name, email, and family role.');
 return {displayName,email,role};
}
export async function adminPageRequest(c,{path,method,input,familyId,userId}) {
 const memberRoute=path.match(/^\/api\/family-members(?:\/(\d+))?$/);
 if(memberRoute){
  const id=Number(memberRoute[1]);
  if(method==='GET'&&!id){const [members]=await c.execute('SELECT user_id AS userId,family_id AS familyId,display_name AS displayName,email,role,family_joined_at AS joinedAt FROM users WHERE family_id=? ORDER BY display_name,user_id',[familyId]);return {members};}
  if(method==='POST'&&!id){const value=memberInput(input);const [created]=await c.execute('INSERT INTO users (family_id,display_name,email,role) VALUES (?,?,?,?)',[familyId,value.displayName,value.email,value.role]);return {userId:Number(created.insertId)};}
  if(id&&['PUT','DELETE'].includes(method)){
   const [members]=await c.execute('SELECT user_id,role FROM users WHERE user_id=? AND family_id=? FOR UPDATE',[id,familyId]);if(!members.length)throw fail(404,'Family member not found.');
   if(method==='DELETE'){
    if(id===userId)throw fail(400,'You cannot remove your own account from the family.');
    if(members[0].role==='owner'){const [[owners]]=await c.execute("SELECT COUNT(*) AS count FROM users WHERE family_id=? AND role='owner'",[familyId]);if(Number(owners.count)<=1)throw fail(400,'Keep at least one family owner.');}
    await c.execute('DELETE FROM bracket_members WHERE family_id=? AND user_id=?',[familyId,id]);await c.execute('UPDATE users SET family_id=NULL,role=NULL,family_joined_at=NULL WHERE user_id=?',[id]);return {removed:true};
   }
   const value=memberInput(input);
   if(members[0].role==='owner'&&value.role!=='owner'){const [[owners]]=await c.execute("SELECT COUNT(*) AS count FROM users WHERE family_id=? AND role='owner'",[familyId]);if(Number(owners.count)<=1)throw fail(400,'Keep at least one family owner.');}
   await c.execute('UPDATE users SET display_name=?,email=?,role=? WHERE user_id=? AND family_id=?',[value.displayName,value.email,value.role,id,familyId]);return {saved:true};
  }
 }
 const songRoute=path.match(/^\/api\/songs(?:\/(\d+))?$/);
 if(songRoute){
  const id=Number(songRoute[1]);
  // Catalog songs are available if they are unassigned or belong to this family.
  if(method==='GET'&&!id){const [songs]=await c.execute(`SELECT s.song_id AS songId,s.artist,s.title,s.album,s.year,s.category,s.youtube_url AS youtubeUrl,s.spotify_url AS spotifyUrl FROM songs s WHERE NOT EXISTS (SELECT 1 FROM bracket_songs bs WHERE bs.song_id=s.song_id) OR EXISTS (SELECT 1 FROM bracket_songs bs JOIN brackets b ON b.bracket_id=bs.bracket_id WHERE bs.song_id=s.song_id AND b.family_id=?) ORDER BY s.artist,s.title,s.song_id`,[familyId]);return {songs};}
  if(id&&['PUT','DELETE'].includes(method)){
   const [songs]=await c.execute('SELECT song_id FROM songs WHERE song_id=? FOR UPDATE',[id]);if(!songs.length)throw fail(404,'Song not found.');
   const [[scope]]=await c.execute('SELECT COUNT(*) AS count FROM bracket_songs bs JOIN brackets b ON b.bracket_id=bs.bracket_id WHERE bs.song_id=? AND b.family_id<>?',[id,familyId]);if(Number(scope.count))throw fail(403,'This song is used by another family and cannot be changed here.');
   if(method==='DELETE'){const [[used]]=await c.execute('SELECT COUNT(*) AS count FROM bracket_songs WHERE song_id=?',[id]);if(Number(used.count))throw fail(409,'Songs used in a bracket cannot be deleted.');await c.execute('DELETE FROM songs WHERE song_id=?',[id]);return {removed:true};}
  }
  if((method==='POST'&&!id)||(method==='PUT'&&id)){
   try{validateBracketSongs([{...input,seed:null}]);}catch(error){throw fail(400,error.message);}
   const artist=String(input.artist??'').trim();if(!artist||artist.length>160)throw fail(400,'Enter an artist of up to 160 characters.');
   const values=[artist,input.title.trim(),input.album?.trim()||null,input.year??null,input.category?.trim()||null,input.youtubeUrl?.trim()||null,input.spotifyUrl?.trim()||null];
   if(id){await c.execute('UPDATE songs SET artist=?,title=?,album=?,year=?,category=?,youtube_url=?,spotify_url=? WHERE song_id=?',[...values,id]);return {saved:true};}
   const [created]=await c.execute('INSERT INTO songs (artist,title,album,year,category,youtube_url,spotify_url) VALUES (?,?,?,?,?,?,?)',values);return {songId:Number(created.insertId)};
  }
 }
 if(path==='/api/playlist-options'&&method==='GET'){
  const [brackets]=await c.execute('SELECT bracket_id AS bracketId,title,artist FROM brackets WHERE family_id=? ORDER BY title,bracket_id',[familyId]);
  const [weeks]=await c.execute('SELECT w.bracket_id AS bracketId,w.week_id AS weekId,w.week_number AS weekNumber FROM bracket_weeks w JOIN brackets b ON b.bracket_id=w.bracket_id WHERE b.family_id=? ORDER BY w.week_number',[familyId]);return {brackets:brackets.map(b=>({...b,weeks:weeks.filter(w=>w.bracketId===b.bracketId)}))};
 }
 const playlistRoute=path.match(/^\/api\/playlists(?:\/(\d+))?$/);
 if(playlistRoute){
  const id=Number(playlistRoute[1]);
  if(method==='GET'&&!id){const [playlists]=await c.execute(`SELECT p.playlist_id AS playlistId,p.bracket_id AS bracketId,b.title AS bracketTitle,b.artist AS bracketArtist,p.week_id AS weekId,w.week_number AS weekNumber,p.playlist_name AS playlistName,p.playlist_url AS playlistUrl FROM bracket_playlists p JOIN brackets b ON b.bracket_id=p.bracket_id LEFT JOIN bracket_weeks w ON w.week_id=p.week_id WHERE b.family_id=? ORDER BY b.title,w.week_number,p.playlist_id`,[familyId]);return {playlists};}
  if(id){const [owned]=await c.execute('SELECT p.playlist_id FROM bracket_playlists p JOIN brackets b ON b.bracket_id=p.bracket_id WHERE p.playlist_id=? AND b.family_id=? FOR UPDATE',[id,familyId]);if(!owned.length)throw fail(404,'Playlist not found.');if(method==='DELETE'){await c.execute('DELETE FROM bracket_playlists WHERE playlist_id=?',[id]);return {removed:true};}}
  if((method==='POST'&&!id)||(method==='PUT'&&id)){
   const name=String(input.playlistName??'').trim(),url=String(input.playlistUrl??'').trim(),bracketId=Number(input.bracketId),weekId=input.weekId==null?null:Number(input.weekId);
   if(!name||name.length>160||url.length>2048||!/^https?:\/\/[^\s]+$/i.test(url)||!Number.isSafeInteger(bracketId)||(weekId!==null&&(!Number.isSafeInteger(weekId)||weekId<1)))throw fail(400,'Enter a valid bracket, playlist name, and HTTP or HTTPS URL.');
   const [brackets]=await c.execute('SELECT bracket_id FROM brackets WHERE bracket_id=? AND family_id=?',[bracketId,familyId]);if(!brackets.length)throw fail(404,'Bracket not found.');
   if(weekId!==null){const [weeks]=await c.execute('SELECT week_id FROM bracket_weeks WHERE week_id=? AND bracket_id=?',[weekId,bracketId]);if(!weeks.length)throw fail(400,'Choose a session belonging to this bracket.');}
   if(id){await c.execute('UPDATE bracket_playlists SET bracket_id=?,week_id=?,playlist_name=?,playlist_url=? WHERE playlist_id=?',[bracketId,weekId,name,url,id]);return {saved:true};}
   const [created]=await c.execute('INSERT INTO bracket_playlists (bracket_id,week_id,playlist_name,playlist_url) VALUES (?,?,?,?)',[bracketId,weekId,name,url]);return {playlistId:Number(created.insertId)};
  }
 }
 throw fail(405,'This management route does not support that action.');
}
