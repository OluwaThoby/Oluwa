import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { evaluateProspectContactReadiness } from '@/lib/intelligence/prospect-contact-readiness.mjs';
export const dynamic = 'force-dynamic';
async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL && email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}
export async function GET() {
  if (!await isOwner()) return NextResponse.json({error:'Unauthorized'},{status:401});
  if (!process.env.DATABASE_URL) return NextResponse.json({error:'Database unavailable'},{status:503});
  try {
    const db=neon(process.env.DATABASE_URL);
    const rows=await db`
      SELECT p.id,p.business_name,p.business_email,p.source,p.source_url,p.consent_basis,p.status,
        EXISTS(SELECT 1 FROM public.email_suppressions s WHERE lower(s.email)=lower(trim(p.business_email))) AS is_suppressed
      FROM public.prospects p ORDER BY p.created_at DESC LIMIT 500
    `;
    const prospects=rows.map(row=>({...row,contactReadiness:evaluateProspectContactReadiness(row)}));
    const summary={total:prospects.length,readyForHumanApproval:prospects.filter(p=>p.contactReadiness.readyForHumanApproval).length,needsReview:prospects.filter(p=>!p.contactReadiness.readyForHumanApproval).length,suppressed:prospects.filter(p=>p.contactReadiness.reasons.includes('contact_is_suppressed')).length,draftsBlocked:prospects.filter(p=>!p.contactReadiness.draftAllowed).length};
    return NextResponse.json({prospects,summary,sendingEnabled:false});
  } catch { return NextResponse.json({error:'Could not evaluate prospect contact evidence.'},{status:500}); }
}
