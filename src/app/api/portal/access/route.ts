import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { cookies } from 'next/headers';
import { hashPortalToken,newPortalToken,PORTAL_COOKIE,portalCookieOptions,portalSessionExpiry } from '@/lib/portal-auth';

export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!process.env.DATABASE_URL)return NextResponse.json({error:'Portal database is not configured.'},{status:503});
 try{
  const body=await request.json();const invite=typeof body?.token==='string'?body.token:'';
  if(!/^[A-Za-z0-9_-]{40,100}$/.test(invite))return NextResponse.json({error:'This access link is invalid or expired.'},{status:400});
  const db=neon(process.env.DATABASE_URL);const sessionToken=newPortalToken();const expires=portalSessionExpiry();
  const rows=await db`
   WITH consumed AS (
    UPDATE public.client_portal_invites SET consumed_at=now()
    WHERE token_hash=${hashPortalToken(invite)} AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>now()
    RETURNING client_id
   ), session AS (
    INSERT INTO public.client_portal_sessions(client_id,token_hash,expires_at)
    SELECT client_id,${hashPortalToken(sessionToken)},${expires.toISOString()}::timestamptz FROM consumed
    RETURNING client_id
   )
   SELECT c.id,c.business_name FROM session s JOIN public.clients c ON c.id=s.client_id
  `;
  if(!rows[0])return NextResponse.json({error:'This access link has already been used, revoked or expired. Ask the agency for a new one.'},{status:401});
  const response=NextResponse.json({ok:true,client:rows[0]});
  response.cookies.set(PORTAL_COOKIE,sessionToken,portalCookieOptions(expires));
  return response;
 }catch{return NextResponse.json({error:'Could not establish a secure portal session.'},{status:500});}
}
export async function DELETE(){
 const jar=await cookies();const token=jar.get(PORTAL_COOKIE)?.value||'';
 if(process.env.DATABASE_URL&&token){const db=neon(process.env.DATABASE_URL);await db`UPDATE public.client_portal_sessions SET revoked_at=now() WHERE token_hash=${hashPortalToken(token)} AND revoked_at IS NULL`;}
 const response=NextResponse.json({ok:true});response.cookies.set(PORTAL_COOKIE,'',{...portalCookieOptions(new Date(0)),maxAge:0});return response;
}
