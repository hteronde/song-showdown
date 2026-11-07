import mysql from 'mysql2/promise';
import { bootstrapOwner } from '../server/bootstrap-owner.mjs';

const [familyId, email, displayName] = process.argv.slice(2);
if (!familyId || !email || !displayName) {
  console.error('Usage: node --env-file-if-exists=.env scripts/bootstrap-owner.mjs FAMILY_ID EMAIL "Display name"');
  process.exit(1);
}
const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 8889),
  user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'music_bracket'
});
try {
  await connection.beginTransaction();
  const owner = await bootstrapOwner(connection, { familyId: Number(familyId), email, displayName, appUrl: process.env.APP_URL || 'http://localhost:4200' });
  await connection.commit();
  console.log(`First owner created. Privately deliver this single-use setup link to the owner (expires in 30 minutes):\n${owner.link}`);
} catch (error) {
  await connection.rollback();
  console.error(error.code === 'ER_DUP_ENTRY' ? 'That email already exists. No existing account was changed.' : error.message);
  process.exitCode = 1;
} finally { await connection.end(); }
