const denied = () => Object.assign(new Error('Bracket not found or not available to your account.'), { status: 404 });

// Bracket roles belong to memberships, and require acceptance before granting privileges.
export async function authorizeBracket(connection, userId, bracketId, { manageOnly = false } = {}) {
  if (!Number.isSafeInteger(bracketId) || bracketId < 1) throw denied();
  const [rows] = await connection.execute(`SELECT b.bracket_id AS bracketId,b.family_id AS familyId,u.user_role,
    EXISTS (SELECT 1 FROM bracket_members bm WHERE bm.bracket_id=b.bracket_id AND bm.family_id=b.family_id
      AND bm.user_id=u.user_id AND bm.invitation_status='accepted' AND bm.bracket_role='commissioner') AS isCommissioner,
    EXISTS (SELECT 1 FROM bracket_members bm WHERE bm.bracket_id=b.bracket_id
      AND bm.family_id=b.family_id AND bm.user_id=u.user_id AND bm.invitation_status='accepted' AND b.status<>'draft'
      AND (bm.non_finale_participant=TRUE OR bm.finale_participant=TRUE)) AS isParticipant
    FROM brackets b JOIN users u ON u.family_id=b.family_id
    WHERE b.bracket_id=? AND u.user_id=?`, [bracketId, userId]);
  const access = rows[0];
  if (!access) throw denied();
  const canManage = access.user_role === 'super' || Boolean(Number(access.isCommissioner));
  if (manageOnly ? !canManage : !canManage && !Number(access.isParticipant)) throw denied();
  return {...access,canManage};
}

export async function authorizeBracketRequest(connection, userId, method, pathname) {
  const bracket = pathname.match(/^\/api\/(admin\/)?brackets\/(\d+)(?:\/|$)/);
  if (bracket) return authorizeBracket(connection, userId, Number(bracket[2]), { manageOnly: !!bracket[1] || method !== 'GET' });
  const vote = pathname.match(/^\/api\/matchups\/(\d+)\/votes$/);
  if (vote) {
    const [rows] = await connection.execute('SELECT bracket_id AS bracketId FROM matchups WHERE matchup_id=?', [Number(vote[1])]);
    if (!rows.length) throw denied();
    return authorizeBracket(connection, userId, Number(rows[0].bracketId));
  }
}
