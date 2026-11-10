import { createHash, randomBytes } from 'node:crypto';

export function createUnsubscribeToken() {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  return { token, tokenHash };
}

export function hashUnsubscribeToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
