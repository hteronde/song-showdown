const fail=(status,message)=>Object.assign(new Error(message),{status});
export function validateEmailChanges(changes) {
  if(!Array.isArray(changes)||!changes.length) throw fail(400,'Provide at least one email change.');
  const ids=new Set();
  return changes.map(change=>{
    if(!change || !Number.isSafeInteger(change.userId) || change.userId<1 || ids.has(change.userId)) throw fail(400,'Choose each participant only once.');
    ids.add(change.userId);
    if(typeof change.email!=='string'||typeof change.previousEmail!=='string') throw fail(400,'Provide the participant’s current and new email.');
    const email=change.email.trim().toLowerCase();
    if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400,'Enter a valid email address for each participant.');
    return {userId:change.userId,email,previousEmail:change.previousEmail};
  });
}
// The caller wraps the whole batch in one transaction, including duplicate-email failures.
export async function saveParticipantEmails(c,familyId,input) {
  const changes=validateEmailChanges(input?.changes);
  const [members]=await c.execute(`SELECT user_id AS userId,email FROM users WHERE family_id=? AND user_id IN (${changes.map(()=>'?').join(',')}) ORDER BY user_id FOR UPDATE`,[familyId,...changes.map(change=>change.userId)]);
  if(members.length!==changes.length) throw fail(403,'One or more participants do not belong to your family.');
  for(const change of changes) {
    if(members.find(member=>Number(member.userId)===change.userId).email!==change.previousEmail) throw fail(409,'An email has changed since this modal opened. Reload this page to load the latest email addresses.');
  }
  for(const change of changes) await c.execute('UPDATE users SET email=? WHERE user_id=? AND family_id=?',[change.email,change.userId,familyId]);
  return {members:changes.map(({userId,email})=>({userId,email}))};
}
