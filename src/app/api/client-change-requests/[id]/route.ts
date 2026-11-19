import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
export const dynamic='force-dynamic';
async function isOwner(){const {data}=await auth.getSession();const email=data?.user?.email;return Boolean(email&&process.env.OWNER_EMAIL&&email.toLowerCase()===process.env.OWNER_EMAIL.toLowerCase());}
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
 if(!(await isOwner()))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:'Database is not configured.'},{status:503});
 try{
  const {id}=await context.params;const body=await request.json();const status=['submitted','reviewing','needs_information','approved','in_progress','ready_for_review','completed','declined'].includes(body?.status)?body.status:null;
  const note=typeof body?.customer_visible_note==='string'?body.customer_visible_note.trim().slice(0,2000):null;
  if(!status)return NextResponse.json({error:'A valid request status is required.'},{status:400});
  const db=neon(process.env.DATABASE_URL);
  const rows=await db`UPDATE public.client_change_requests SET status=${status},customer_visible_note=COALESCE(${note},customer_visible_note),updated_at=now() WHERE id=${id} RETURNING id,client_id,project_id,title,status,customer_visible_note`;
  if(!rows[0])return NextResponse.json({error:'Change request not found.'},{status:404});
  await db`INSERT INTO public.activity_log(department,event_type,summary,entity_type,entity_id,metadata) VALUES('client_success','change_request_updated',${'Change request '+status+': '+rows[0].title},'client',${rows[0].client_id}::uuid,${JSON.stringify({request_id:id,status})}::jsonb)`;
  return NextResponse.json({request:rows[0]});
 }catch{return NextResponse.json({error:'Could not update change request.'},{status:500});}
}
