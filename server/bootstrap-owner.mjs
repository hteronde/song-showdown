import { randomBytes } from 'node:crypto';
import { tokenHash, resetLink } from './password-reset.mjs';

// Operator-only bootstrap. Never expose this function as a public HTTP endpoint.
export async function bootstrapOwner(connection, { familyId, email, displayName, appUrl }) {
  if (!Number.isSafeInteger(familyId) || familyId < 1 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof displayName !== 'string' || !displayName.trim() || displayName.length > 120) {
    throw new Error('Provide a family ID, email address, and display name.');
  }
  // Lock the family to serialize competing first-owner creation attempts.
  const [families] = await connection.execute('SELECT family_id FROM families WHERE family_id=? FOR UPDATE', [familyId]);
  if (!families.length) throw new Error('Family not found.');
  const [owners] = await connection.execute("SELECT user_id FROM users WHERE family_id=? AND role='owner' FOR UPDATE", [familyId]);
  if (owners.length) throw new Error('This family already has an owner. Use email recovery instead.');
  const [created] = await connection.execute("INSERT INTO users (family_id,email,display_name,role,password_hash) VALUES (?,?,?,'owner',NULL)", [familyId, email.trim(), displayName.trim()]);
  const token = randomBytes(32).toString('base64url');
  await connection.execute('INSERT INTO password_reset_tokens (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))', [tokenHash(token), created.insertId]);
  return { userId: created.insertId, link: resetLink(appUrl, token) };
}
