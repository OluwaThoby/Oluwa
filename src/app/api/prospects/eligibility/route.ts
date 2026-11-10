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
    const rows=await db`SELECT id,business_name,business_email,source,source_url,consent_basis,status,created_at FROM public.prospects ORDER BY created_at DESC LIMIT 500`;
    let suppressionLookupAvailable=true;
    let suppressedEmails=new Set();
    try {
      const suppressions=await db`SELECT email FROM public.email_suppressions`;
      suppressedEmails=new Set(suppressions.map(row=>String(row.email).trim().toLowerCase()));
    } catch {
      // The suppression migration is intentionally not applied without owner approval.
      suppressionLookupAvailable=false;
    }
    const prospects=rows.map(row=>{
      const result=evaluateProspectContactReadiness({...row,is_suppressed:suppressedEmails.has(String(row.business_email||'').trim().toLowerCase())});
      if(!suppressionLookupAvailable){
        result.readyForHumanApproval=false;
        result.draftAllowed=false;
        result.nextStep='suppression_registry_migration_requires_owner_approval';
        result.reasons.push('suppression_registry_unavailable');
      }
      return {...row,contactReadiness:result};
    });
    const summary={total:prospects.length,readyForHumanApproval:prospects.filter(p=>p.contactReadiness.readyForHumanApproval).length,needsReview:prospects.filter(p=>!p.contactReadiness.readyForHumanApproval).length,suppressed:prospects.filter(p=>p.contactReadiness.reasons.includes('contact_is_suppressed')).length,draftsBlocked:prospects.filter(p=>!p.contactReadiness.draftAllowed).length};
    return NextResponse.json({prospects,summary,suppressionLookupAvailable,sendingEnabled:false});
  } catch { return NextResponse.json({error:'Could not evaluate prospect contact evidence.'},{status:500}); }
}
