import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL &&
    email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const { id } = await context.params;
    const db = neon(process.env.DATABASE_URL);
    const prospects = await db`
      SELECT id,business_name,website_url,category,city,country,research_summary
      FROM public.prospects WHERE id=${id} LIMIT 1
    `;
    const prospect = prospects[0];
    if (!prospect) return NextResponse.json({ error: 'Prospect not found.' }, { status: 404 });
    const audits = await db`
      SELECT id,website_url,overall_score,findings,recommendations,verified_at
      FROM public.seo_audits WHERE prospect_id=${id}
      ORDER BY verified_at DESC NULLS LAST,created_at DESC LIMIT 1
    `;
    const audit = audits[0] || null;
    const findings = Array.isArray(audit?.findings) ? audit.findings : [];
    const recommendations = Array.isArray(audit?.recommendations) ? audit.recommendations : [];
    const proposal = {
      document_type: 'Website improvement proposal',
      version: '1.0',
      status: 'DRAFT — NOT APPROVED OR SENT',
      prepared_for: prospect.business_name,
      prepared_by: 'AgencyOS',
      prepared_on: new Date().toISOString(),
      business_context: {
        business_name: prospect.business_name,
        category: prospect.category || 'Not supplied',
        location: [prospect.city, prospect.country].filter(Boolean).join(', ') || 'Not supplied',
        website: prospect.website_url || 'No website supplied',
        supplied_notes: prospect.research_summary || 'No additional business notes supplied'
      },
      assessment: audit ? {
        source: 'Saved AgencyOS public HTML inspection',
        inspected_url: audit.website_url,
        inspected_at: audit.verified_at,
        preliminary_score: audit.overall_score,
        findings: findings.map((f:any) => ({ area:f.label, result:f.detail, severity:f.severity, evidence:f.value ?? null })),
        limitations: ['Single public HTML response only','No JavaScript rendering or full site crawl','No Lighthouse/Core Web Vitals measurements','No backlink, traffic, keyword, ranking or conversion analytics']
      } : {
        source: 'No saved website inspection',
        note: 'This proposal is a discovery draft. Run a website inspection first to include evidence-based findings.',
        findings: []
      },
      proposed_work: recommendations.length ? recommendations.map((r:any) => ({
        work_item: r.finding,
        suggested_action: r.recommendation
      })) : [
        { work_item: 'Discovery and requirements', suggested_action: 'Confirm the business goals, target customers, priority services and required website functionality.' },
        { work_item: 'Website review', suggested_action: 'Review the current website and agree on the specific improvements before work begins.' }
      ],
      deliverables: [
        'Agreed website improvement plan and page structure',
        'Implementation of the approved scope',
        'Responsive layout checks across common screen sizes',
        'Basic on-page metadata and heading review for agreed pages',
        'Pre-handover functional checks and a change summary'
      ],
      scope_boundaries: [
        'Only the scope approved in writing will be delivered.',
        'Copywriting, photography, paid software, hosting, domains, third-party subscriptions and ongoing SEO are excluded unless separately agreed.',
        'No ranking, traffic, lead-volume or revenue outcome is guaranteed.',
        'This draft is not a contract, invoice, quote or commitment to a delivery date.'
      ],
      commercial_terms: {
        currency: 'To be agreed',
        proposed_fee: null,
        payment_schedule: 'To be agreed before work starts',
        delivery_timeline: 'To be confirmed after scope and required assets are agreed',
        maintenance: 'Optional separate monthly service; scope and fee to be agreed'
      },
      client_inputs_needed: [
        'Confirm the main business goal and target audience',
        'Provide approved brand assets, service details and contact information',
        'Confirm required pages, integrations and functionality',
        'Approve final scope, price and delivery schedule'
      ],
      next_step: 'Arrange a short discovery conversation, confirm the scope and prepare a formal quote for approval.',
      approval: { approved:false, sent:false, approved_at:null, sent_at:null }
    };
    const saved = await db`
      INSERT INTO public.agency_proposals (prospect_id,audit_id,proposal,status)
      VALUES (${prospect.id},${audit?.id || null},${JSON.stringify(proposal)}::jsonb,'draft')
      RETURNING id,created_at,status
    `;
    return NextResponse.json({ proposal: { ...proposal, id:saved[0].id, created_at:saved[0].created_at, record_status:saved[0].status } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not prepare proposal.' }, { status: 500 });
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const { id } = await context.params;
    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      SELECT id,proposal,status,created_at FROM public.agency_proposals
      WHERE prospect_id=${id} ORDER BY created_at DESC LIMIT 10
    `;
    return NextResponse.json({ proposals: rows });
  } catch {
    return NextResponse.json({ error: 'Could not load proposal history.' }, { status: 500 });
  }
}


export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const proposalId = typeof body.proposal_id === 'string' ? body.proposal_id : '';
    const fee = typeof body.fee === 'string' ? body.fee.trim().slice(0, 80) : '';
    const currency = typeof body.currency === 'string' ? body.currency.trim().slice(0, 12) : 'To be agreed';
    const timeline = typeof body.timeline === 'string' ? body.timeline.trim().slice(0, 160) : '';
    if (!proposalId || !timeline) return NextResponse.json({ error: 'A proposal ID and delivery timeline are required.' }, { status: 400 });
    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      SELECT id,proposal FROM public.agency_proposals
      WHERE id=${proposalId} AND prospect_id=${id} AND status='draft' LIMIT 1
    `;
    if (!rows[0]) return NextResponse.json({ error: 'Editable draft not found.' }, { status: 404 });
    const proposal = rows[0].proposal as Record<string, any>;
    proposal.commercial_terms = {
      ...proposal.commercial_terms,
      proposed_fee: fee || null,
      currency: currency || 'To be agreed',
      delivery_timeline: timeline
    };
    const updated = await db`
      UPDATE public.agency_proposals
      SET proposal=${JSON.stringify(proposal)}::jsonb, updated_at=now()
      WHERE id=${proposalId} AND prospect_id=${id}
      RETURNING id,updated_at
    `;
    return NextResponse.json({ proposal: { ...proposal, id: updated[0].id, updated_at: updated[0].updated_at } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update proposal.' }, { status: 500 });
  }
}
