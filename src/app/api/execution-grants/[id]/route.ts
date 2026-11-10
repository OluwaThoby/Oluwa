import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL && email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return NextResponse.json({ error: 'Invalid grant ID.' }, { status: 400 });
  try {
    const body = await request.json();
    if (body?.confirmed !== true || body?.action !== 'revoke') return NextResponse.json({ error: 'Explicit revoke confirmation is required.' }, { status: 400 });
    const db = neon(process.env.DATABASE_URL);
    const rows = await db\`
      UPDATE public.execution_grants
      SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
      WHERE id = \${id} AND status = 'active'
      RETURNING id, grant_name, agent_key, status, revoked_at
    \`;
    if (!rows.length) return NextResponse.json({ error: 'Grant is not active or does not exist.' }, { status: 409 });
    return NextResponse.json({ grant: rows[0], message: 'Permission revoked. Future actions using this grant must be denied.' });
  } catch {
    return NextResponse.json({ error: 'Unable to revoke the permission safely.' }, { status: 500 });
  }
}
