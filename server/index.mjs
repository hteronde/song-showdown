import mysql from 'mysql2/promise';
import { createApiServer } from './api-server.mjs';

const port = Number(process.env.API_PORT || 3000);
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 8889),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'music_bracket',
  waitForConnections: true,
  connectionLimit: 5,
  decimalNumbers: true
});
const app = createApiServer({ pool });
app.server.listen(port, '127.0.0.1', () => {
  console.log(`Music Bracket API listening at http://127.0.0.1:${port}`);
  app.startProgression();
});

async function shutdown() {
  await app.close();
  await pool.end();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
