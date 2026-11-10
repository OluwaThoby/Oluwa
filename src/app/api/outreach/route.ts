import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
export const dynamic='force-dynamic';
async function owner(){const {data}=await auth.getSession();const email=data?.user?.email;return Boolean(email&&process.env.OWNER_EMAIL&&email.toLowerCase()===process.env.OWNER_EMAIL.toLowerCase());}
export async function GET(){
  if(!await owner())return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!process.env.DATABASE_URL)return NextResponse.json({error:'Database unavailable'},{status:503});
  try{
    const db=neon(process.env.DATABASE_URL);
    const [prospects,messages,suppressions]=await Promise.all([
      db`SELECT id,business_name,business_email,website_url,category,city,country,status,consent_basis FROM public.prospects WHERE status<>'suppressed' ORDER BY created_at DESC LIMIT 500`,
      db`SELECT m.id,m.prospect_id,m.subject,m.body,m.status,m.created_at,m.approved_at,m.sent_at,p.business_name,p.business_email FROM public.messages m LEFT JOIN public.prospects p ON p.id=m.prospect_id WHERE m.direction='outbound' ORDER BY m.created_at DESC LIMIT 300`,
      db`SELECT email FROM public.email_suppressions`,
    ]);
    const blocked=new Set(suppressions.map(row=>String(row.email).trim().toLowerCase()));
    const safeProspects=prospects.filter(p=>!p.business_email||!blocked.has(String(p.business_email).trim().toLowerCase()));
    return NextResponse.json({prospects:safeProspects,messages,suppressionRegistryAvailable:true});
  }catch{
    return NextResponse.json({error:'Outreach is temporarily unavailable because the suppression registry could not be checked. No drafts can be prepared until suppression checks are available.'},{status:503});
  }
}
export async function POST(req:Request){
  if(!await owner())return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!process.env.DATABASE_URL)return NextResponse.json({error:'Database unavailable'},{status:503});
  try{
    const b=await req.json();
    const prospectId=typeof b.prospect_id==='string'?b.prospect_id:'';
    const subject=typeof b.subject==='string'?b.subject.trim():'';
    const body=typeof b.body==='string'?b.body.trim():'';
    if(!prospectId||!subject||!body)return NextResponse.json({error:'Choose a prospect and provide an email subject and message.'},{status:400});
    if(subject.length>220||body.length>12000)return NextResponse.json({error:'Draft is too long.'},{status:400});
    const db=neon(process.env.DATABASE_URL);
    const p=await db`SELECT id,business_email,status FROM public.prospects WHERE id=${prospectId} LIMIT 1`;
    if(!p.length)return NextResponse.json({error:'Prospect not found.'},{status:404});
    if(p[0].status==='suppressed'||p[0].status==='do_not_contact')return NextResponse.json({error:'This prospect is blocked from outreach.'},{status:409});
    if(!p[0].business_email)return NextResponse.json({error:'Add and verify a business email before preparing an email draft.'},{status:409});
    const suppression=await db`SELECT 1 FROM public.email_suppressions WHERE lower(email)=lower(trim(${p[0].business_email})) LIMIT 1`;
    if(suppression.length)return NextResponse.json({error:'This email address is on the suppression list and cannot be used for outreach.'},{status:409});
    const rows=await db`INSERT INTO public.messages(prospect_id,direction,subject,body,status) VALUES(${prospectId},'outbound',${subject},${body},'draft') RETURNING id,prospect_id,subject,body,status,created_at`;
    return NextResponse.json({message:rows[0]},{status:201});
  }catch{
    return NextResponse.json({error:'Could not save draft. The suppression registry must be available before outreach drafts can be created.'},{status:503});
  }
}
export async function PATCH(req:Request){
  if(!await owner())return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!process.env.DATABASE_URL)return NextResponse.json({error:'Database unavailable'},{status:503});
  try{
    const b=await req.json();
    const id=typeof b.id==='string'?b.id:'';
    const subject=typeof b.subject==='string'?b.subject.trim():'';
    const body=typeof b.body==='string'?b.body.trim():'';
    if(!id||!subject||!body||subject.length>220||body.length>12000)return NextResponse.json({error:'Valid draft ID, subject and body are required.'},{status:400});
    const db=neon(process.env.DATABASE_URL);
    const existing=await db`SELECT m.id,p.business_email,p.status FROM public.messages m LEFT JOIN public.prospects p ON p.id=m.prospect_id WHERE m.id=${id} AND m.direction='outbound' AND m.status='draft' LIMIT 1`;
    if(!existing.length)return NextResponse.json({error:'Only unsent drafts can be edited.'},{status:409});
    if(existing[0].status==='suppressed'||existing[0].status==='do_not_contact')return NextResponse.json({error:'This prospect is blocked from outreach.'},{status:409});
    if(existing[0].business_email){
      const suppression=await db`SELECT 1 FROM public.email_suppressions WHERE lower(email)=lower(trim(${existing[0].business_email})) LIMIT 1`;
      if(suppression.length)return NextResponse.json({error:'This email address is suppressed. The draft cannot be edited for outreach.'},{status:409});
    }
    const rows=await db`UPDATE public.messages SET subject=${subject},body=${body} WHERE id=${id} AND direction='outbound' AND status='draft' RETURNING id,prospect_id,subject,body,status,created_at`;
    return NextResponse.json({message:rows[0]});
  }catch{return NextResponse.json({error:'Could not update draft because suppression checks were unavailable.'},{status:503});}
}
