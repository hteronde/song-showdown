const fail=(status,message)=>Object.assign(new Error(message),{status});

// Check the original response under the bracket lock before membership edits.
// A stale editor must not overwrite a new response or accept a removed member.
export async function validateInvitationChanges(c,bracketId,participantIds,changes=[]) {
  if (!Array.isArray(changes)) throw fail(400,'Provide valid invitation status changes.');
  const seen=new Set();
  for (const change of changes) {
    if (!change || !Number.isSafeInteger(change.userId) || !participantIds.includes(change.userId) || seen.has(change.userId)
        || !['pending','accepted','declined'].includes(change.previousStatus) || !['accepted','declined'].includes(change.status)) {
      throw fail(400,'Choose Accepted or Declined for a selected participant with an existing invitation.');
    }
    seen.add(change.userId);
    const [rows]=await c.execute('SELECT invitation_status FROM bracket_members WHERE bracket_id=? AND user_id=? FOR UPDATE',[bracketId,change.userId]);
    if(rows[0]?.invitation_status!==change.previousStatus) throw fail(409,'An invitation status has changed. Reopen Manage Participants before saving.');
  }
  return changes.filter(change=>change.status!==change.previousStatus);
}
