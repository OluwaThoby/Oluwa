import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { neon } from '@neondatabase/serverless';

export const PORTAL_COOKIE = 'agencyos_client_portal';
const SESSION_DAYS = 14;
export const hashPortalToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newPortalToken = () => randomBytes(32).toString('base64url');

export async function getPortalClient(db: ReturnType<typeof neon>) {
  const jar = await cookies();
  const token = jar.get(PORTAL_COOKIE)?.value || '';
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const rows = await db`
    SELECT c.id,c.business_name,c.primary_contact,c.email,c.status,s.id AS session_id
    FROM public.client_portal_sessions s
    JOIN public.clients c ON c.id=s.client_id
    WHERE s.token_hash=${hashPortalToken(token)}
      AND s.revoked_at IS NULL AND s.expires_at>now()
    LIMIT 1
  `;
  if (!rows[0]) return null;
  await db`UPDATE public.client_portal_sessions SET last_seen_at=now() WHERE id=${rows[0].session_id}`;
  return rows[0] as {id:string;business_name:string;primary_contact:string|null;email:string|null;status:string};
}

export const portalSessionExpiry = () => new Date(Date.now() + SESSION_DAYS*24*60*60*1000);
export const portalCookieOptions = (expires: Date) => ({
  httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,
  path:'/portal',expires,
});
