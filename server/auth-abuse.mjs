import { createHash } from 'node:crypto';
import { readJson } from './request-json.mjs';

export const maxPasswordBytes = 1024;
export const authBodyBytes = 8 * 1024;
const fail = (status, message, retryAfter) => Object.assign(new Error(message), { status, ...(retryAfter ? { retryAfter } : {}) });
export function validatePassword(password, minimum = 1) {
  if (typeof password !== 'string' || password.length < minimum || Buffer.byteLength(password, 'utf8') > maxPasswordBytes) {
    throw fail(400, `Use a password with at least ${minimum} character${minimum === 1 ? '' : 's'} and at most ${maxPasswordBytes} UTF-8 bytes.`);
  }
  return password;
}
const digest = value => createHash('sha256').update(value).digest('hex');

// Single-process limiter; forwarded headers are ignored unless the caller explicitly supplies a trusted resolver.
export function createAuthRateLimiter({ now = Date.now, maxEntries = 10000, clientAddress = request => request.socket?.remoteAddress || 'unknown' } = {}) {
  const buckets = new Map();
  let nextSweep = 0;
  function consume(key, limit, windowMs) {
    const time = now();
    if (time >= nextSweep) {
      for (const [entry, bucket] of buckets) if (bucket.until <= time) buckets.delete(entry);
      nextSweep = time + 1000;
    }
    let bucket = buckets.get(key);
    if (bucket?.until <= time) { buckets.delete(key); bucket = null; }
    if (!bucket) {
      if (buckets.size >= maxEntries) throw fail(503, 'Authentication is busy. Please try again shortly.', 60);
      bucket = { count: 0, until: time + windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.count >= limit) throw fail(429, 'Too many authentication attempts. Please try again later.', Math.max(1, Math.ceil((bucket.until - time) / 1000)));
    bucket.count++;
  }
  return {
    checkRequest(request, path) {
      const ip = digest(clientAddress(request));
      consume(`all:${ip}`, 120, 60000);
      if (request.method !== 'POST') return;
      if (path === '/api/auth/login') consume(`login:${ip}`, 30, 15 * 60000);
      if (path === '/api/auth/forgot-password') consume(`request:${ip}`, 10, 15 * 60000);
      if (['/api/auth/setup-password','/api/auth/reset-password'].includes(path)) consume(`complete:${ip}`, 20, 15 * 60000);
    },
    checkSubject(path, input) {
      if (path === '/api/auth/login') consume(`account:${digest(input.username.toLowerCase())}`, 10, 15 * 60000);
      if (path === '/api/auth/forgot-password') consume(`email:${digest(input.username.toLowerCase())}`, 5, 15 * 60000);
      if (['/api/auth/setup-password','/api/auth/reset-password'].includes(path)) consume(`token:${digest(input.token)}`, 5, 15 * 60000);
    }
  };
}

export async function readAuthInput(request, path, limiter) {
  const input = await readJson(request, authBodyBytes);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400, 'Provide authentication details as a JSON object.');
  if (path === '/api/auth/login' || path === '/api/auth/forgot-password') {
    if (typeof input.username !== 'string' || input.username.length > 254 || !input.username.trim()) throw fail(400, 'Enter your account email address (up to 254 characters).');
    input.username = input.username.trim();
  }
  if (path === '/api/auth/login') validatePassword(input.password);
  if (['/api/auth/setup-password','/api/auth/reset-password'].includes(path)) {
    if (typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) throw fail(400, 'This reset link is invalid or expired. Request a new link.');
    validatePassword(input.password, 12);
  }
  limiter.checkSubject(path, input);
  return input;
}

// Reject excess work rather than building an unbounded queue of scrypt jobs.
export function createPasswordWorkLimit(maxConcurrent = 2) {
  let active = 0;
  return async work => {
    if (active >= maxConcurrent) throw fail(503, 'Authentication is busy. Please try again shortly.', 1);
    active++;
    try { return await work(); }
    finally { active--; }
  };
}
export const runPasswordWork = createPasswordWorkLimit();
