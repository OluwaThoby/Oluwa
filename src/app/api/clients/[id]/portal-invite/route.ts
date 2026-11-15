import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { hashPortalToken,newPortalToken } from '@/lib/portal-auth';

export const dynamic='force-dynamic';
async function isOwner(){const {data}=await auth.getSession();const email=data?.user?.email;return Boolean(email&&process.env.OWNER_EMAIL&&email.toLowerCase()===process.env.OWNER_EMAIL.toLowerCase());}
export async function POST(_request:Request,context:{params:Promise<{id:string}>}){
 if(!(await isOwner()))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:'Database is not configured.'},{status:503});
 try{
  const {id}=await context.params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:'Invalid client ID.'},{status:400});
  const token=newPortalToken();const db=neon(process.env.DATABASE_URL);const expires=new Date(Date.now()+72*60*60*1000);
  const rows=await db`
   WITH client AS (SELECT id FROM public.clients WHERE id=${id} LIMIT 1),
   revoked AS (UPDATE public.client_portal_invites SET revoked_at=now() WHERE client_id=${id} AND consumed_at IS NULL AND revoked_at IS NULL RETURNING id),
   created AS (INSERT INTO public.client_portal_invites(client_id,token_hash,expires_at)
     SELECT id,${hashPortalToken(token)},${expires.toISOString()}::timestamptz FROM client RETURNING id,client_id,expires_at)
   SELECT created.id,created.expires_at,c.business_name FROM created JOIN public.clients c ON c.id=created.client_id
  `;
  if(!rows[0])return NextResponse.json({error:'Client account not found.'},{status:404});
  const origin=new URL(_request.url).origin;
  return NextResponse.json({invite_url:origin+'/portal?token='+encodeURIComponent(token),expires_at:rows[0].expires_at,client_name:rows[0].business_name,message:'Copy this one-time access link and share it privately with the client. It expires in 72 hours.'},{status:201});
 }catch{return NextResponse.json({error:'Could not create a client portal invitation.'},{status:500});}
}
