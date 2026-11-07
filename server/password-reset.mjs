import { validatePassword } from './auth-abuse.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword } from './passwords.mjs';

export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export function resetLink(baseUrl, token) {
  const url = new URL(baseUrl);
  url.hash = new URLSearchParams({ resetToken: token }).toString();
  return url.href;
}

export async function requestPasswordReset(pool, username, deliver) {
  const connection = await pool.getConnection();
  let delivery;
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute('SELECT user_id, email FROM users WHERE family_id IS NOT NULL AND LOWER(email) = LOWER(?) LIMIT 1 FOR UPDATE', [username]);
    if (users.length) {
      const user = users[0];
      const [recent] = await connection.execute('SELECT token_hash FROM password_reset_tokens WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE) LIMIT 1', [user.user_id]);
      if (!recent.length) {
        const token = randomBytes(32).toString('base64url');
        await connection.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.user_id]);
        await connection.execute('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))', [tokenHash(token), user.user_id]);
        delivery = { email: user.email, token };
      }
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  if (delivery) await deliver(delivery);
}

export async function completePasswordReset(pool, token, password, { hash = hashPassword } = {}) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw Object.assign(new Error('This reset link is invalid or expired. Request a new link.'), { status: 400 });
  validatePassword(password, 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Match the request path's lock order so concurrent requests cannot deadlock.
    const [users] = await connection.execute('SELECT u.user_id FROM users u JOIN password_reset_tokens t ON t.user_id = u.user_id WHERE t.token_hash = ? AND u.family_id IS NOT NULL FOR UPDATE', [tokenHash(token)]);
    const [tokens] = await connection.execute('SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > NOW() AND used_at IS NULL FOR UPDATE', [tokenHash(token)]);
    if (!users.length || !tokens.length) throw Object.assign(new Error('This reset link is invalid or expired. Request a new link.'), { status: 400 });
    // Only a live, locked token is allowed to consume a bounded hashing slot.
    const passwordHash = await hash(password);
    const userId = tokens[0].user_id;
    await connection.execute('UPDATE users SET password_hash = ? WHERE user_id = ?', [passwordHash, userId]);
    await connection.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ?', [userId]);
    await connection.execute('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function deliverPasswordReset({ email, token }) {
  const link = resetLink(process.env.APP_URL || 'http://localhost:4200', token);
  if (process.env.PASSWORD_RESET_EMAIL_WEBHOOK) {
    const response = await fetch(process.env.PASSWORD_RESET_EMAIL_WEBHOOK, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.PASSWORD_RESET_EMAIL_SECRET ? { Authorization: `Bearer ${process.env.PASSWORD_RESET_EMAIL_SECRET}` } : {}) },
      body: JSON.stringify({ to: email, subject: 'Reset your Song Showdown password', text: `Reset your password: ${link}\nThis link expires in 30 minutes. If you did not request it, ignore this email.` }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('Password reset email delivery failed.');
  } else if (process.env.NODE_ENV !== 'production') {
    console.log(`Password reset for ${email}: ${link}`);
  } else throw new Error('Password reset email delivery is not configured.');
}
