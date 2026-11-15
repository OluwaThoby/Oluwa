import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getPortalClient } from '@/lib/portal-auth';

export const dynamic='force-dynamic';
export async function GET(){
 if(!process.env.DATABASE_URL)return NextResponse.json({error:'Portal database is not configured.'},{status:503});
 try{
  const db=neon(process.env.DATABASE_URL);const client=await getPortalClient(db);
  if(!client)return NextResponse.json({error:'Please open a valid client access link.'},{status:401});
  const [projects,requests]=await Promise.all([
   db`SELECT p.id,p.name,p.service_type,p.status,p.brief,p.preview_url,p.production_url,p.created_at,p.updated_at,
       (SELECT COUNT(*)::int FROM public.project_tasks t WHERE t.project_id=p.id) AS task_count,
       (SELECT COUNT(*)::int FROM public.project_tasks t WHERE t.project_id=p.id AND t.status='done') AS completed_tasks,
       (SELECT jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'status',t.status,'due_at',t.due_at,'priority',t.priority) ORDER BY t.sort_order,t.created_at) FROM public.project_tasks t WHERE t.project_id=p.id) AS milestones
     FROM public.projects p WHERE p.client_id=${client.id} ORDER BY p.updated_at DESC`,
   db`SELECT r.id,r.project_id,r.title,r.description,r.category,r.status,r.customer_visible_note,r.created_at,r.updated_at,p.name AS project_name
      FROM public.client_change_requests r JOIN public.projects p ON p.id=r.project_id
      WHERE r.client_id=${client.id} ORDER BY r.created_at DESC LIMIT 100`
  ]);
  return NextResponse.json({client:{business_name:client.business_name,primary_contact:client.primary_contact},projects,change_requests:requests});
 }catch{return NextResponse.json({error:'Unable to load the client portal.'},{status:500});}
}
export async function POST(request:Request){
 if(!process.env.DATABASE_URL)return NextResponse.json({error:'Portal database is not configured.'},{status:503});
 try{
  const db=neon(process.env.DATABASE_URL);const client=await getPortalClient(db);
  if(!client)return NextResponse.json({error:'Please open a valid client access link.'},{status:401});
  const body=await request.json();const projectId=typeof body?.project_id==='string'?body.project_id:'';
  const title=typeof body?.title==='string'?body.title.trim():'';
  const description=typeof body?.description==='string'?body.description.trim():'';
  const category=['content','design','functionality','bug','other'].includes(body?.category)?body.category:'other';
  if(!/^[0-9a-f-]{36}$/i.test(projectId)||title.length<3||title.length>180||description.length<5||description.length>8000)return NextResponse.json({error:'Provide a project, a short title and a clear description.'},{status:400});
  const rows=await db`
   INSERT INTO public.client_change_requests(client_id,project_id,title,description,category)
   SELECT ${client.id},p.id,${title},${description},${category}
   FROM public.projects p WHERE p.id=${projectId} AND p.client_id=${client.id}
   RETURNING id,title,status,created_at
  `;
  if(!rows[0])return NextResponse.json({error:'That project is not available in this client account.'},{status:404});
  await db`INSERT INTO public.activity_log(department,event_type,summary,entity_type,entity_id,metadata)
   VALUES('client_success','customer_change_request_submitted',${'Customer submitted change request: '+title},'client',${client.id}::uuid,${JSON.stringify({request_id:rows[0].id,project_id:projectId})}::jsonb)`;
  return NextResponse.json({request:rows[0],message:'Your request has been sent to the agency for review.'},{status:201});
 }catch{return NextResponse.json({error:'Could not submit the change request.'},{status:500});}
}
