import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ALLOWED_FIELDS = [
  'agency_name', 'base_location', 'target_markets', 'core_services',
  'project_price_range', 'maintenance_price', 'seo_price',
  'team_capacity', 'current_pipeline', 'marketing_budget',
  'sales_channels', 'delivery_stack', 'business_constraints',
] as const;
type Field = typeof ALLOWED_FIELDS[number];

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL &&
    email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}

export async function GET() {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const db = neon(process.env.DATABASE_URL);
    const email = process.env.OWNER_EMAIL!.trim().toLowerCase();
    const rows = await db`
      SELECT profile, verified_fields, version, updated_at
      FROM public.agency_business_profile WHERE owner_email = ${email} LIMIT 1
    `;
    return NextResponse.json({
      profile: rows[0]?.profile ?? {},
      verifiedFields: rows[0]?.verified_fields ?? [],
      version: rows[0]?.version ?? 0,
      updatedAt: rows[0]?.updated_at ?? null,
      fields: ALLOWED_FIELDS,
    });
  } catch {
    return NextResponse.json({ error: 'Could not load the business profile.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) {
      return NextResponse.json({ error: 'A profile object is required.' }, { status: 400 });
    }
    const profile: Record<string, string> = {};
    for (const field of ALLOWED_FIELDS) {
      const value = body.profile[field];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string' || value.length > 2000) {
        return NextResponse.json({ error: 'Profile fields must be text under 2,000 characters.' }, { status: 400 });
      }
      if (value.trim()) profile[field] = value.trim();
    }
    const requestedVerified = Array.isArray(body.verifiedFields) ? body.verifiedFields : [];
    const verifiedFields = [...new Set(requestedVerified.filter(
      (field: unknown): field is Field => typeof field === 'string' &&
        (ALLOWED_FIELDS as readonly string[]).includes(field) &&
        typeof profile[field as Field] === 'string',
    ))];
    const db = neon(process.env.DATABASE_URL);
    const email = process.env.OWNER_EMAIL!.trim().toLowerCase();
    const rows = await db`
      INSERT INTO public.agency_business_profile (owner_email, profile, verified_fields, version, updated_at)
      VALUES (${email}, ${JSON.stringify(profile)}::jsonb, ${verifiedFields}::text[], 1, now())
      ON CONFLICT (owner_email) DO UPDATE SET
        profile = EXCLUDED.profile,
        verified_fields = EXCLUDED.verified_fields,
        version = public.agency_business_profile.version + 1,
        updated_at = now()
      RETURNING profile, verified_fields, version, updated_at
    `;
    return NextResponse.json({
      saved: true, profile: rows[0].profile,
      verifiedFields: rows[0].verified_fields,
      version: rows[0].version, updatedAt: rows[0].updated_at,
      message: 'Business profile saved. Only fields you marked as verified will be treated as facts by AgencyOS agents.',
    });
  } catch {
    return NextResponse.json({ error: 'Could not save the business profile.' }, { status: 400 });
  }
}
