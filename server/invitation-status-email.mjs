import {deliverEmail,passwordEmailConfigured} from './password-reset.mjs';

export function invitationStatusEmail(change,appUrl) {
  const status=change.status==='accepted'?'Accepted':'Declined';
  const access=change.status==='accepted'
    ? 'You are participating in this bracket. Open the bracket below to see its schedule. Voting opens at the scheduled start of each session.'
    : 'You are no longer participating in this bracket and cannot access its matchups or vote. Contact your commissioner if this needs to be changed.';
  return {to:change.email,subject:`Invitation ${status}: ${change.title}`,
    text:`An administrator updated your invitation status for ${change.title}.\n\nTheme: ${change.artist}\nPrevious status: ${change.previousStatus}\nNew status: ${status}\n\n${access}\n\nBracket page:\n${new URL(`/brackets/${change.bracketId}`,appUrl).href}`};
}

// Called only after the participant transaction commits. A provider failure must
// never roll back a successful status change or masquerade as a failed save.
export async function sendInvitationStatusEmails(changes,{deliver=deliverEmail,env=process.env}={}) {
  const result={sent:0,failed:0};
  for(const change of changes) {
    try {
      if(!passwordEmailConfigured(env))throw new Error('Email is not configured.');
      await deliver(invitationStatusEmail(change,env.APP_URL));
      result.sent++;
    } catch {
      result.failed++;
      console.error('Invitation status notification failed. Check email configuration and provider delivery logs.');
    }
  }
  return result;
}
