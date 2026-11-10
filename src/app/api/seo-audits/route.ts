import {NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {auth} from '@/lib/auth';
export const dynamic='force-dynamic';
async function isOwner(){const {data}=await auth.getSession();const email=data?.user?.email;return Boolean(email&&process.env.OWNER_EMAIL&&email.toLowerCase()===process.env.OWNER_EMAIL.toLowerCase());}
export async function GET(){
 if(!(await isOwner()))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:'Database is not configured.'},{status:503});
 try{
  const db=neon(process.env.DATABASE_URL);
  const [audits,summary]=await Promise.all([
   db`SELECT a.id,a.prospect_id,a.website_url,a.overall_score,a.findings,a.recommendations,a.provider,a.verified_at,a.created_at,p.business_name,p.city,p.country FROM public.seo_audits a LEFT JOIN public.prospects p ON p.id=a.prospect_id ORDER BY COALESCE(a.verified_at,a.created_at) DESC LIMIT 250`,
   db`SELECT COUNT(*)::int AS total_audits,COUNT(DISTINCT prospect_id)::int AS sites_audited,ROUND(AVG(overall_score))::int AS average_score,COUNT(*) FILTER(WHERE overall_score<60)::int AS needs_attention,MAX(COALESCE(verified_at,created_at)) AS last_audit FROM public.seo_audits`
  ]);
  return NextResponse.json({audits,summary:summary[0]||{total_audits:0,sites_audited:0,average_score:null,needs_attention:0,last_audit:null}});
 }catch{return NextResponse.json({error:'Could not load SEO audit history.'},{status:500});}
}