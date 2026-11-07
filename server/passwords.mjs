import { runPasswordWork, validatePassword } from './auth-abuse.mjs';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const key = await runPasswordWork(() => scryptAsync(password, salt, KEY_LENGTH, {
    N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: 64 * 1024 * 1024
  }));
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  validatePassword(password);
  if (typeof encoded !== 'string') return false;
  const [algorithm, costText, blockText, parallelText, saltHex, keyHex, extra] = encoded.split('$');
  const cost = Number(costText), blockSize = Number(blockText), parallelization = Number(parallelText);
  if (algorithm !== 'scrypt' || extra !== undefined || !Number.isInteger(cost) || cost < 16_384 || cost > 262_144
    || !Number.isInteger(blockSize) || blockSize < 1 || blockSize > 16
    || !Number.isInteger(parallelization) || parallelization < 1 || parallelization > 4
    || !/^[a-f\d]{32}$/.test(saltHex || '') || !/^[a-f\d]{128}$/.test(keyHex || '')) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await runPasswordWork(() => scryptAsync(password, salt, expected.length, {
    N: cost, r: blockSize, p: parallelization, maxmem: 128 * 1024 * 1024
  }));
  return timingSafeEqual(expected, actual);
}
