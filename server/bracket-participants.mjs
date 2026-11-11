import { saveBracketRoles } from './bracket-roles.mjs';
import {saveParticipantEmails} from './participant-emails.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function saveBracketParticipants(c,{bracketId,familyId,userId,input,canAssignRoles=false}) {
  const ids=input.participantIds;
  if (!canAssignRoles && input.changes?.length) throw fail(403,'Only a super user can change account email addresses.');
  if(!Array.isArray(ids)||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)throw fail(400,'Choose valid participants.');
  if(bracketId) {
    const [brackets]=await c.execute('SELECT bracket_id FROM brackets WHERE bracket_id=? AND family_id=? FOR UPDATE',[bracketId,familyId]);
    if(!brackets.length)throw fail(404,'Bracket not found.');
  }else{
    const title=String(input.title??'').trim(),theme=String(input.artist??'').trim();
    if(!title||!theme||title.length>160||theme.length>160)throw fail(400,'Enter a Title and Theme before saving participants.');
    const [created]=await c.execute("INSERT INTO brackets (family_id,created_by_user_id,title,artist,status) VALUES (?,?,?,?,'draft')",[familyId,userId,title,theme]);bracketId=Number(created.insertId);
  }
  if (!ids.length) {
    const updated=input.changes?.length?await saveParticipantEmails(c,familyId,{changes:input.changes}):{members:[]};
    await c.execute('DELETE FROM bracket_members WHERE bracket_id=?',[bracketId]);
    await c.execute("UPDATE brackets SET draft_settings=CASE WHEN draft_settings IS NULL THEN NULL ELSE JSON_SET(draft_settings,'$.participantIds',JSON_ARRAY(),'$.participantRoles',JSON_OBJECT()) END WHERE bracket_id=?",[bracketId]);
    return {bracketId,participantIds:[],members:updated.members};
  }
  const [members]=await c.execute(`SELECT user_id FROM users WHERE family_id=? AND user_id IN (${ids.map(()=>'?').join(',')})`,[familyId,...ids]);
  if(members.length!==ids.length)throw fail(403,'One or more participants do not belong to your family.');
  const updated=input.changes?.length?await saveParticipantEmails(c,familyId,{changes:input.changes}):{members:[]};
  await c.execute(`DELETE FROM bracket_members WHERE bracket_id=? AND user_id NOT IN (${ids.map(()=>'?').join(',')})`,[bracketId,...ids]);
  for(const id of ids)await c.execute('INSERT IGNORE INTO bracket_members (bracket_id,family_id,user_id,non_finale_participant,finale_participant,invitation_status) VALUES (?,?,?,TRUE,TRUE,\'pending\')',[bracketId,familyId,id]);
  await saveBracketRoles(c,bracketId,ids,input.participantRoles,canAssignRoles);
  const [roles] = await c.execute('SELECT user_id AS userId,bracket_role FROM bracket_members WHERE bracket_id=?',[bracketId]);
  await c.execute("UPDATE brackets SET draft_settings=CASE WHEN draft_settings IS NULL THEN NULL ELSE JSON_SET(draft_settings,'$.participantIds',CAST(? AS JSON),'$.participantRoles',CAST(? AS JSON)) END WHERE bracket_id=?",[JSON.stringify(ids),JSON.stringify(Object.fromEntries(roles.map(member=>[member.userId,member.bracket_role]))),bracketId]);
  return {bracketId,participantIds:ids,members:updated.members};
}
