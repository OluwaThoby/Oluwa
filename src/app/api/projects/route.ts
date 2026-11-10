import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
export const dynamic = 'force-dynamic';
async function isOwner(){const {data}=await auth.getSession();const email=data?.user?.email;return Boolean(email&&process.env.OWNER_EMAIL&&email.toLowerCase()===process.env.OWNER_EMAIL.toLowerCase());}
export async function GET(){
 if(!(await isOwner()))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:'Database is not configured.'},{status:503});
 try{const db=neon(process.env.DATABASE_URL);const projects=await db`
 SELECT p.id,p.client_id,p.name,p.service_type,p.status,p.brief,p.preview_url,p.production_url,p.agreed_value,p.currency,p.created_at,p.updated_at,c.business_name AS client_name,
 COALESCE(t.total,0)::int AS task_total,COALESCE(t.done,0)::int AS task_done,t.next_due
 FROM public.projects p LEFT JOIN public.clients c ON c.id=p.client_id
 LEFT JOIN LATERAL(SELECT count(*) AS total,count(*) FILTER(WHERE status='done') AS done,min(due_at) FILTER(WHERE status<>'done' AND due_at IS NOT NULL) AS next_due FROM public.project_tasks WHERE project_id=p.id)t ON true
 ORDER BY CASE p.status WHEN 'blocked' THEN 0 WHEN 'building' THEN 1 WHEN 'qa' THEN 2 WHEN 'awaiting_approval' THEN 3 WHEN 'planning' THEN 4 WHEN 'brief_needed' THEN 5 WHEN 'deploying' THEN 6 WHEN 'live' THEN 7 ELSE 8 END,p.updated_at DESC LIMIT 200`;
 return NextResponse.json({projects});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not load projects.'},{status:500});}
}