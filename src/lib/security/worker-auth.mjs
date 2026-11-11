import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedWorkerRequest(authorizationHeader, configuredSecret) {
  if (typeof configuredSecret !== 'string' || configuredSecret.length < 32) return false;
  if (typeof authorizationHeader !== 'string') return false;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const supplied = match[1];
  if (supplied.length !== configuredSecret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(configuredSecret));
}
