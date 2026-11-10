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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    if (body.confirmed !== true || typeof body.proposal_id !== 'string') {
      return NextResponse.json({ error: 'Explicit acceptance confirmation is required.' }, { status: 400 });
    }
    const db = neon(process.env.DATABASE_URL);
    const result = await db`
      WITH source AS (
        SELECT p.id AS prospect_id, p.business_name, p.business_email, p.phone,
               a.id AS proposal_id, a.proposal
        FROM public.prospects p
        JOIN public.agency_proposals a ON a.prospect_id = p.id
        WHERE p.id = ${id} AND a.id = ${body.proposal_id}
          AND a.status IN ('draft','approved','accepted')
        LIMIT 1
      ),
      inserted_client AS (
        INSERT INTO public.clients (prospect_id,business_name,email,phone,status,notes)
        SELECT s.prospect_id,s.business_name,s.business_email,s.phone,'active',
               'Created from accepted AgencyOS proposal ' || s.proposal_id::text
        FROM source s
        WHERE NOT EXISTS (
          SELECT 1 FROM public.clients c WHERE c.prospect_id=s.prospect_id
        )
        RETURNING id,prospect_id
      ),
      updated_client AS (
        UPDATE public.clients c
        SET status='active',updated_at=now()
        FROM source s
        WHERE c.prospect_id=s.prospect_id
          AND NOT EXISTS (SELECT 1 FROM inserted_client)
        RETURNING c.id,c.prospect_id
      ),
      selected_client AS (
        SELECT id,prospect_id FROM inserted_client
        UNION ALL
        SELECT id,prospect_id FROM updated_client
        LIMIT 1
      ),
      inserted_project AS (
        INSERT INTO public.projects
          (client_id,name,service_type,status,brief,agreed_value,currency)
        SELECT
          c.id,
          'Website improvement — ' || s.business_name,
          'Website improvement',
          'brief_needed',
          jsonb_build_object(
            'proposal_id',s.proposal_id,
            'scope',s.proposal->'proposed_work',
            'deliverables',s.proposal->'deliverables',
            'client_inputs_needed',s.proposal->'client_inputs_needed',
            'source_proposal',s.proposal
          ),
          CASE
            WHEN COALESCE(s.proposal->'commercial_terms'->>'proposed_fee','') ~ '^[[:space:]]*[0-9]+([.][0-9]{1,2})?[[:space:]]*$'
            THEN trim(s.proposal->'commercial_terms'->>'proposed_fee')::numeric
            ELSE NULL
          END,
          COALESCE(NULLIF(s.proposal->'commercial_terms'->>'currency',''),'NGN')
        FROM source s
        JOIN selected_client c ON c.prospect_id=s.prospect_id
        WHERE NOT EXISTS (
          SELECT 1 FROM public.projects pr
          WHERE pr.brief->>'proposal_id'=s.proposal_id::text
        )
        RETURNING id,client_id
      ),
      accepted AS (
        UPDATE public.agency_proposals
        SET status='accepted',updated_at=now()
        WHERE id=${body.proposal_id} AND prospect_id=${id}
        RETURNING id
      )
      SELECT
        (SELECT id FROM selected_client LIMIT 1) AS client_id,
        COALESCE(
          (SELECT id FROM inserted_project LIMIT 1),
          (SELECT pr.id FROM public.projects pr
           WHERE pr.brief->>'proposal_id'=${body.proposal_id} LIMIT 1)
        ) AS project_id,
        (SELECT id FROM accepted LIMIT 1) AS proposal_id
    `;
    if (!result[0]?.proposal_id || !result[0]?.client_id || !result[0]?.project_id) {
      return NextResponse.json({ error: 'Could not convert this proposal. Confirm the prospect and saved draft still exist.' }, { status: 409 });
    }
    return NextResponse.json({
      success: true,
      message: 'Accepted proposal converted into a client and a project brief.',
      client_id: result[0].client_id,
      project_id: result[0].project_id,
      proposal_id: result[0].proposal_id
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not convert accepted proposal.' }, { status: 500 });
  }
}
