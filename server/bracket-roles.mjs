const fail = (status, message) => Object.assign(new Error(message), { status });
export const commissionerRequiredMessage='Keep at least one selected participant with the Commissioner role. Assign another commissioner before removing or changing the last one.';
export function requireCommissioner(participantIds, roles) {
  if(!participantIds.some(id=>roles[id]==='commissioner'))throw fail(400,commissionerRequiredMessage);
}
export async function saveBracketRoles(c, bracketId, participantIds, roles, canAssignRoles) {
  if (roles !== undefined && (!roles || typeof roles !== 'object' || Array.isArray(roles))) throw fail(400, 'Choose a valid bracket role.');
  const selected = new Set(participantIds.map(Number));
  const requested=roles??{};
  for (const [id, role] of Object.entries(requested)) {
    if (!selected.has(Number(id)) || !['member','commissioner'].includes(role)) throw fail(400, 'Choose Member or Commissioner for each selected participant.');
  }
  const [current] = await c.execute('SELECT user_id AS userId,bracket_role FROM bracket_members WHERE bracket_id=? FOR UPDATE',[bracketId]);
  const existing=Object.fromEntries(current.map(member=>[member.userId,member.bracket_role]));
  if (!canAssignRoles && Object.entries(requested).some(([id,role])=>role!==(existing[id]??'member'))) throw fail(403,'Only a super user can assign bracket roles.');
  // Validate the final roster even when a caller omits the role map.
  requireCommissioner([...selected],{...existing,...requested});
  for (const member of current) {
    const role = requested[member.userId];
    if (role === undefined || role === member.bracket_role) continue;
    if (!canAssignRoles) throw fail(403, 'Only a super user can assign bracket roles.');
    await c.execute('UPDATE bracket_members SET bracket_role=? WHERE bracket_id=? AND user_id=?',[role,bracketId,member.userId]);
  }
}
