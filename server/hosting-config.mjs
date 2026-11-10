import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

export function hostingConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT || env.API_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  const appUrl = env.APP_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '');
  const origins = new Set();
  if (appUrl) {
    const parsed = new URL(appUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || (production && parsed.protocol !== 'https:')) throw new Error('APP_URL must be an HTTPS website URL in production.');
    origins.add(parsed.origin);
  }
  return {
    port,
    host: env.API_HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    production,
    appUrl,
    origins,
    staticDirectory: env.SERVE_FRONTEND === 'false' ? null : production || env.SERVE_FRONTEND === 'true'
      ? fileURLToPath(new URL('../dist/song-showdown/browser/', import.meta.url)) : null,
    trustRailwayProxy: env.TRUST_RAILWAY_PROXY === 'true'
  };
}

export function originAllowed(origin, {production = false, origins = new Set()} = {}) {
  if (!origin) return true; // CLI requests and top-level navigation may omit Origin.
  return origins.has(origin) || (!production && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
}

// Opt in only behind Railway's HTTP ingress, with no public direct/TCP listener
// or untrusted services able to reach the application over private networking.
export function clientAddress(request, trustRailwayProxy = false) {
  const realIp = request.headers?.['x-real-ip'];
  if (trustRailwayProxy && typeof realIp === 'string' && isIP(realIp)) return realIp;
  return request.socket?.remoteAddress || 'unknown';
}
