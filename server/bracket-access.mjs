const denied = () => Object.assign(new Error('Bracket not found or not available to your account.'), { status: 404 });

// Always read the current family and role from the database, rather than trusting IDs from the client.
export async function authorizeBracket(connection, userId, bracketId, { ownerOnly = false } = {}) {
  if (!Number.isSafeInteger(bracketId) || bracketId < 1) throw denied();
  const [rows] = await connection.execute(`SELECT b.bracket_id AS bracketId,b.family_id AS familyId,u.role,
    EXISTS (SELECT 1 FROM bracket_members bm WHERE bm.bracket_id=b.bracket_id
      AND bm.family_id=b.family_id AND bm.user_id=u.user_id
      AND (bm.non_finale_participant=TRUE OR bm.finale_participant=TRUE)) AS isParticipant
    FROM brackets b JOIN users u ON u.family_id=b.family_id
    WHERE b.bracket_id=? AND u.user_id=?`, [bracketId, userId]);
  const access = rows[0];
  if (!access || (ownerOnly ? access.role !== 'owner' : access.role !== 'owner' && !Number(access.isParticipant))) throw denied();
  return access;
}

// Covers every bracket subroute, including admin, voting, history, and finale routes.
export async function authorizeBracketRequest(connection, userId, method, pathname) {
  const bracket = pathname.match(/^\/api\/(admin\/)?brackets\/(\d+)(?:\/|$)/);
  if (bracket) return authorizeBracket(connection, userId, Number(bracket[2]), { ownerOnly: !!bracket[1] || method !== 'GET' });
  const vote = pathname.match(/^\/api\/matchups\/(\d+)\/votes$/);
  if (vote) {
    const [rows] = await connection.execute('SELECT bracket_id AS bracketId FROM matchups WHERE matchup_id=?', [Number(vote[1])]);
    if (!rows.length) throw denied();
    return authorizeBracket(connection, userId, Number(rows[0].bracketId));
  }
}
