import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {deliverEmail, passwordEmailConfigured} from './password-reset.mjs';

const fail = (status, message) => Object.assign(new Error(message), {status});
export function parseBracketEmail(input) {
  const {subject, body, requestId, recipientIds} = input ?? {};
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\r\n]/.test(subject))
    throw fail(400, 'Enter a subject of up to 200 characters on one line.');
  if (typeof body !== 'string' || !body.trim() || body.length > 20000)
    throw fail(400, 'Enter an email body of up to 20,000 characters.');
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(requestId))
    throw fail(400, 'Please reopen the email form and try again.');
  if (recipientIds !== undefined && (!Array.isArray(recipientIds) || !recipientIds.length || recipientIds.length > 10000 || recipientIds.some(id=>!Number.isSafeInteger(id) || id<1)))
    throw fail(400, 'Select at least one valid participant.');
  return {subject:subject.trim(), body:body.trim(), requestId, recipientIds:recipientIds === undefined ? undefined : [...new Set(recipientIds)]};
}

// Authorization is enforced by the admin bracket route before entering this helper.
export async function sendBracketEmail(pool, bracketId, input, {deliver=deliverEmail, env=process.env, pause=delay}={}) {
  const {subject, body, requestId, recipientIds} = parseBracketEmail(input);
  if (!passwordEmailConfigured(env)) throw fail(503, 'Email delivery is not configured.');
  const [eligibleRecipients] = await pool.execute(`SELECT DISTINCT u.user_id AS userId,u.email
    FROM bracket_members bm JOIN brackets b ON b.bracket_id=bm.bracket_id AND b.family_id=bm.family_id
    JOIN users u ON u.user_id=bm.user_id AND u.family_id=b.family_id
    WHERE bm.bracket_id=? AND bm.invitation_status='accepted'
    ORDER BY u.user_id`, [bracketId]);
  if (recipientIds?.some(id=>!eligibleRecipients.some(recipient=>Number(recipient.userId)===id)))
    throw fail(409, 'One or more selected participants are no longer eligible. Reopen Write email to refresh the recipient list.');
  const recipients=recipientIds === undefined ? eligibleRecipients : eligibleRecipients.filter(recipient=>recipientIds.includes(Number(recipient.userId)));
  if (!recipients.length) throw fail(400, 'This bracket has no accepted participants to email.');
  const result = {sent:0, failed:0};
  const fingerprint=createHash('sha256').update(JSON.stringify([subject,body])).digest('hex');
  for (const [index, recipient] of recipients.entries()) {
    if (index) await pause(550);
    try {
      await deliver({to:recipient.email, subject, text:body}, {env,
        idempotencyKey:`bracket-email/${bracketId}/${requestId}/${recipient.userId}/${fingerprint}`});
      result.sent++;
    } catch { result.failed++; }
  }
  return result;
}
