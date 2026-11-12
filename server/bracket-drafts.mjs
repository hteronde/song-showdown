import {requireCommissioner} from './bracket-roles.mjs';
import {saveAutomaticEmailSetting} from './bracket-email-settings.mjs';
import {validateSessionPlaylists} from './session-playlists.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const draftKeys=['automaticEmailsDisabled','sessionPlaylists','sessionSchedule','logoUrl','songCount','songs','participantIds','participantRoles','startAt','songsPerSession','sessionDurationMinutes','durationValue','durationUnit','finaleAt','finaleStartRound','seedingSize','randomizationMode','tiebreakerOption','anonymous'];
export function parseDraftSettings(value) {
  if(!value)return {};
  return typeof value==='string'?JSON.parse(value):value;
}
export function prepareBracketDraft(input) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw fail(400,'Enter a Title and Theme to save a draft.');
  const title=typeof input.title==='string'?input.title.trim():'',artist=typeof input.artist==='string'?input.artist.trim():'';
  if(!title||!artist)throw fail(400,'Title and Theme are required to save a draft.');
  if(title.length>160||artist.length>160)throw fail(400,'Title and Theme must each be 160 characters or fewer.');
  const settings=Object.fromEntries(draftKeys.filter(key=>Object.hasOwn(input,key)).map(key=>[key,input[key]]));
  if(Array.isArray(settings.participantIds) && settings.participantIds.length)requireCommissioner(settings.participantIds,settings.participantRoles??{});
  if(settings.sessionPlaylists!==undefined)settings.sessionPlaylists=validateSessionPlaylists(settings.sessionPlaylists);
  return {title,artist,settings};
}
export async function saveBracketDraft(c,{bracketId,familyId,userId,input}) {
  const {title,artist,settings}=prepareBracketDraft(input);
  if(bracketId) {
    const [rows]=await c.execute(`SELECT bracket_id,status,completed_at,
      (status='active' AND (start_at IS NULL OR start_at<=NOW())) AS hasStarted
      FROM brackets WHERE bracket_id=? AND family_id=? FOR UPDATE`,[bracketId,familyId]);
    if(!rows.length)throw fail(404,'Bracket not found.');
    const bracket=rows[0];
    if(bracket.hasStarted||bracket.status==='complete'||bracket.completed_at)throw fail(409,'An active or completed bracket cannot be saved as a draft. Use Save changes instead.');
    const [[activity]]=await c.execute('SELECT (SELECT COUNT(*) FROM votes WHERE bracket_id=?) + (SELECT COUNT(*) FROM matchups WHERE bracket_id=? AND winner_entry_id IS NOT NULL) + (SELECT COUNT(*) FROM bracket_finale_sessions WHERE bracket_id=?) AS total',[bracketId,bracketId,bracketId]);
    if(Number(activity.total)>0)throw fail(409,'A bracket with voting history cannot be saved as a draft. Use Save changes instead.');
    await c.execute("UPDATE brackets SET title=?,artist=?,draft_settings=?,status='draft',start_at=NULL,paused_at=NULL WHERE bracket_id=? AND family_id=?",[title,artist,JSON.stringify(settings),bracketId,familyId]);
  } else {
    const [created]=await c.execute("INSERT INTO brackets (family_id,created_by_user_id,title,artist,status,draft_settings) VALUES (?,?,?,?,'draft',?)",[familyId,userId,title,artist,JSON.stringify(settings)]);
    bracketId=Number(created.insertId);
  }
  await saveAutomaticEmailSetting(c,bracketId,settings.automaticEmailsDisabled);
  return {bracketId,saved:true,status:'draft'};
}
// Song metadata saves separately; restore current songs and only overlay draft seed assignments.
export function restoreBracketDraft(row,songs) {
  const stored=row.status==='draft'?parseDraftSettings(row.draftSettings):{};
  const {songs:draftSongs, ...settings}=stored;
  const restoredSongs=songs.map(song=>{
    const draft=Array.isArray(draftSongs)?draftSongs.find(item=>item.bracketSongId!=null?Number(item.bracketSongId)===Number(song.bracketSongId):item.title===song.title):null;
    return draft && Object.hasOwn(draft,'assignedSeed')?{...song,assignedSeed:draft.assignedSeed}:song;
  });
  return {settings,songs:restoredSongs};
}

export async function saveDraftSessionSettings(c,{bracketId,familyId,userId,input}) {
  const [rows]=await c.execute('SELECT title,artist,status,draft_settings FROM brackets WHERE bracket_id=? AND family_id=? FOR UPDATE',[bracketId,familyId]);
  if(!rows.length)throw fail(404,'Bracket not found.');
  if(rows[0].status!=='draft')throw fail(409,'This bracket is no longer a draft. Close and reopen the bracket form before saving.');
  const keys=['startAt','songCount','songsPerSession','sessionDurationMinutes','durationValue','durationUnit','finaleAt','finaleStartRound','sessionSchedule'];
  const settings=Object.fromEntries(keys.filter(key=>Object.hasOwn(input??{},key)).map(key=>[key,input[key]]));
  return saveBracketDraft(c,{bracketId,familyId,userId,input:{...parseDraftSettings(rows[0].draft_settings),...settings,title:rows[0].title,artist:rows[0].artist}});
}
