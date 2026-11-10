import {NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {auth} from '@/lib/auth';
export const dynamic='force-dynamic';
async function isOwner(){const {data}=await auth.getSession();const email=data?.user?.email;return Boolean(email&&process.env.OWNER_EMAIL&&email.toLowerCase()===process.env.OWNER_EMAIL.toLowerCase());}
export async function GET(){if(!(await isOwner()))return NextResponse.json({error:'Unauthorized'},{status:401});if(!process.env.DATABASE_URL)return NextResponse.json({error:'Database is not configured.'},{status:503});try{const db=neon(process.env.DATABASE_URL);const clients=await db`
 SELECT c.id,c.prospect_id,c.business_name,c.primary_contact,c.email,c.phone,c.status,c.notes,c.created_at,c.updated_at,
 count(DISTINCT p.id)::int AS project_count,
 count(DISTINCT p.id) FILTER(WHERE p.status NOT IN ('completed','live'))::int AS active_projects,
 count(DISTINCT p.id) FILTER(WHERE p.status='blocked')::int AS blocked_projects,
 max(i.occurred_at) AS last_contact_at,
 count(DISTINCT i.id)::int AS interaction_count
 FROM public.clients c LEFT JOIN public.projects p ON p.client_id=c.id
 LEFT JOIN public.client_interactions i ON i.client_id=c.id
 GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 300`;
return NextResponse.json({clients});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not load clients.'},{status:500});}}
