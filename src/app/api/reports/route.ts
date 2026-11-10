import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(
    email &&
    process.env.OWNER_EMAIL &&
    email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase()
  );
}

export async function GET() {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const db = neon(process.env.DATABASE_URL);
    const [prospects, audits, projects, clients, invoices, activity] = await Promise.all([
      db`SELECT status, COUNT(*)::int AS count
          FROM public.prospects GROUP BY status ORDER BY count DESC`,
      db`SELECT COUNT(*)::int AS total,
          ROUND(AVG(overall_score))::int AS average_score,
          COUNT(*) FILTER (WHERE overall_score < 50)::int AS below_50,
          COUNT(*) FILTER (WHERE overall_score >= 80)::int AS "80_plus"
          FROM public.seo_audits`,
      db`SELECT status, COUNT(*)::int AS count
          FROM public.projects GROUP BY status ORDER BY count DESC`,
      db`SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active
          FROM public.clients`,
      db`SELECT currency,
          COUNT(*)::int AS invoice_count,
          COALESCE(SUM(total), 0)::numeric AS invoiced,
          COALESCE(SUM(amount_paid), 0)::numeric AS collected,
          COALESCE(SUM(GREATEST(total - amount_paid, 0)), 0)::numeric AS outstanding,
          COALESCE(SUM(GREATEST(total - amount_paid, 0))
            FILTER (WHERE due_date < CURRENT_DATE), 0)::numeric AS overdue
          FROM public.agency_invoices
          WHERE status NOT IN ('draft', 'void')
          GROUP BY currency ORDER BY currency`,
      db`SELECT id, department, event_type, summary, entity_type, created_at
          FROM public.activity_log ORDER BY created_at DESC LIMIT 30`,
    ]);

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      prospects,
      audits: audits[0] || { total: 0, average_score: null, below_50: 0, '80_plus': 0 },
      projects,
      clients: clients[0] || { total: 0, active: 0 },
      invoices,
      activity,
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not generate the agency report.' },
      { status: 500 }
    );
  }
}
