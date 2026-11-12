import { deliverEmail, passwordEmailConfigured } from './password-reset.mjs';
const fail = (status, message) => Object.assign(new Error(message), { status });

export function invitationEmail(invite, appUrl) {
  const link = new URL(`/brackets/${invite.bracketId}`, appUrl).href;
  const start = new Date(invite.startAt);
  if (!Number.isFinite(start.getTime())) throw fail(400, 'Set a valid bracket start date before sending invitations.');
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' }).format(start);
  return {
    to: invite.email,
    subject: `You're invited: ${invite.title}`,
    text: `You're invited to join ${invite.title}!\n\nTheme: ${invite.artist}\nStarts: ${date} (America/Chicago)\n\nOpen the bracket invitation to accept or decline:\n${link}\n\nSign in with this email address. If this is your first visit, choose “First time? Request a password link” to set up your password. Songs, matchups, and other bracket details stay hidden until you accept.\n\nIf you decline, you will not participate in this bracket.`
  };
}

// Only title/theme/start date are available before acceptance. Owners retain management access.
export async function getBracketInvitation(c, bracketId, userId) {
  const [rows] = await c.execute(`SELECT b.bracket_id AS bracketId,b.title,b.artist,b.start_at AS startAt,b.status,
    u.user_role,bm.bracket_role,bm.invitation_status AS invitationStatus
    FROM brackets b JOIN users u ON u.family_id=b.family_id
    LEFT JOIN bracket_members bm ON bm.bracket_id=b.bracket_id AND bm.user_id=u.user_id AND bm.family_id=b.family_id
    WHERE b.bracket_id=? AND u.user_id=?`, [bracketId, userId]);
  const row = rows[0];
  if (!row || (row.user_role !== 'super' && (!row.invitationStatus || row.status === 'draft' && !(row.bracket_role === 'commissioner' && row.invitationStatus === 'accepted')))) throw fail(404, 'Invitation not found or no longer available.');
  return { bracketId: Number(row.bracketId), title: row.title, artist: row.artist, startAt: row.startAt,
    invitationStatus: row.invitationStatus, canAccess: row.user_role === 'super' || row.invitationStatus === 'accepted' };
}

export async function respondToInvitation(c, bracketId, userId, response) {
  if (!['accepted', 'declined'].includes(response)) throw fail(400, 'Choose Accept or Decline.');
  // Lock in the same order as participant edits so removal cannot race acceptance.
  const [brackets] = await c.execute('SELECT bracket_id,status FROM brackets WHERE bracket_id=? FOR UPDATE', [bracketId]);
  if (!brackets.length || brackets[0].status === 'draft') throw fail(404, 'Invitation not available.');
  const [members] = await c.execute(`SELECT bm.invitation_status AS status FROM bracket_members bm
    JOIN users u ON u.user_id=bm.user_id AND u.family_id=bm.family_id
    WHERE bm.bracket_id=? AND bm.user_id=? FOR UPDATE`, [bracketId, userId]);
  if (!members.length) throw fail(404, 'Invitation not found or no longer available.');
  if (members[0].status === response) return { invitationStatus: response };
  const rejoining=members[0].status==='declined' && response==='accepted';
  if (members[0].status !== 'pending' && !rejoining) throw fail(409, 'You have already accepted this invitation. Contact your admin to change participation.');
  await c.execute('UPDATE bracket_members SET invitation_status=?,invitation_responded_at=NOW(6) WHERE bracket_id=? AND user_id=?', [response, bracketId, userId]);
  return { invitationStatus: response };
}

export async function listBracketInvitations(c, bracketId) {
  const [rows] = await c.execute(`SELECT bm.user_id AS userId,u.display_name AS displayName,u.email,
    bm.bracket_role,bm.invitation_status AS status,bm.invitation_delivery AS delivery,bm.invitation_sent_at AS sentAt
    FROM bracket_members bm JOIN users u ON u.user_id=bm.user_id AND u.family_id=bm.family_id
    WHERE bm.bracket_id=? ORDER BY u.display_name`, [bracketId]);
  return rows;
}

// Called after saving a published bracket. Successful deliveries are never resent by an ordinary edit.
// Failed/unsent deliveries can be retried; a lease prevents concurrent requests sending the same invite.
export async function sendBracketInvitations(pool, bracketId, { deliver = deliverEmail, env = process.env } = {}) {
  const summary = { sent: 0, failed: 0 };
  try {
    const [rows] = await pool.execute(`SELECT bm.user_id AS userId,b.bracket_id AS bracketId,b.title,b.artist,b.start_at AS startAt,u.email
      FROM bracket_members bm JOIN brackets b ON b.bracket_id=bm.bracket_id
      JOIN users u ON u.user_id=bm.user_id AND u.family_id=bm.family_id
      WHERE bm.bracket_id=? AND b.status<>'draft' AND b.start_at IS NOT NULL
        AND bm.invitation_status='pending' AND bm.invitation_sent_at IS NULL`, [bracketId]);
    for (const row of rows) {
      const [claimed] = await pool.execute(`UPDATE bracket_members SET invitation_delivery='sending',invitation_attempt_at=NOW(6)
        WHERE bracket_id=? AND user_id=? AND invitation_status='pending' AND invitation_sent_at IS NULL
        AND (invitation_attempt_at IS NULL OR invitation_attempt_at < DATE_SUB(NOW(6), INTERVAL 10 MINUTE)
          OR (invitation_delivery='failed' AND invitation_attempt_at < DATE_SUB(NOW(6), INTERVAL 1 MINUTE)))`, [bracketId, row.userId]);
      if (!claimed.affectedRows) continue;
      try {
        if (!passwordEmailConfigured(env)) throw new Error('Email is not configured.');
        await deliver(invitationEmail(row, env.APP_URL));
        await pool.execute("UPDATE bracket_members SET invitation_delivery='sent',invitation_sent_at=NOW(6) WHERE bracket_id=? AND user_id=? AND invitation_delivery='sending'", [bracketId, row.userId]);
        summary.sent++;
      } catch {
        summary.failed++;
        await pool.execute("UPDATE bracket_members SET invitation_delivery='failed' WHERE bracket_id=? AND user_id=? AND invitation_delivery='sending'", [bracketId, row.userId]);
      }
    }
  } catch {
    summary.failed++;
    console.error('Bracket invitation delivery failed. Check email configuration and invitation migration.');
  }
  return summary;
}
