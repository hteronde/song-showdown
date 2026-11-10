import { hostingConfig, clientAddress } from './hosting-config.mjs';
import { checkStaticSite } from './static-site.mjs';
import { createAuthRateLimiter } from './auth-abuse.mjs';
import mysql from 'mysql2/promise';
import { createApiServer } from './api-server.mjs';

const hosting = hostingConfig();
await checkStaticSite(hosting.staticDirectory);
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
const authRateLimiter = createAuthRateLimiter({clientAddress: request => clientAddress(request, hosting.trustRailwayProxy)});
const app = createApiServer({ pool, hosting, authRateLimiter });
app.server.listen(hosting.port, hosting.host, () => {
  console.log(`Music Bracket API listening at http://${hosting.host}:${hosting.port}`);
  app.startProgression();
});

async function shutdown() {
  await app.close();
  await pool.end();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
