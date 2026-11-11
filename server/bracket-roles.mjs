const fail = (status, message) => Object.assign(new Error(message), { status });
export async function saveBracketRoles(c, bracketId, participantIds, roles, canAssignRoles) {
  if (roles === undefined) return;
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) throw fail(400, 'Choose a valid bracket role.');
  const selected = new Set(participantIds.map(Number));
  for (const [id, role] of Object.entries(roles)) {
    if (!selected.has(Number(id)) || !['member','commissioner'].includes(role)) throw fail(400, 'Choose Member or Commissioner for each selected participant.');
  }
  const [current] = await c.execute('SELECT user_id AS userId,bracket_role FROM bracket_members WHERE bracket_id=? FOR UPDATE',[bracketId]);
  if (!canAssignRoles) {
    const existing=Object.fromEntries(current.map(member=>[member.userId,member.bracket_role]));
    if (Object.entries(roles).some(([id,role])=>role!==(existing[id]??'member'))) throw fail(403,'Only a super user can assign bracket roles.');
  }
  for (const member of current) {
    const role = roles[member.userId];
    if (role === undefined || role === member.bracket_role) continue;
    if (!canAssignRoles) throw fail(403, 'Only a super user can assign bracket roles.');
    await c.execute('UPDATE bracket_members SET bracket_role=? WHERE bracket_id=? AND user_id=?',[role,bracketId,member.userId]);
  }
}
