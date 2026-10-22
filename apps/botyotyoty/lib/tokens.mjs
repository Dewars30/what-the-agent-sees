import { createHash, randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const JOIN_LEN = 10;
export const PARENT_LEN = 24;
export const BOT_KEY_LEN = 24;
export const JOIN_TTL_MS = 72 * 60 * 60 * 1000;

export function randomToken(len) {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

export function randomId() {
  return randomUUID();
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function isJoinCode(value) {
  return new RegExp(`^[A-Z2-7]{${JOIN_LEN}}$`).test(value);
}

export function isParentToken(value) {
  return new RegExp(`^[A-Z2-7]{${PARENT_LEN}}$`).test(value);
}

export function isBotKey(value) {
  return new RegExp(`^[A-Z2-7]{${BOT_KEY_LEN}}$`).test(value);
}

export function expiresIn(ms, now = new Date()) {
  return new Date(now.getTime() + ms).toISOString();
}
