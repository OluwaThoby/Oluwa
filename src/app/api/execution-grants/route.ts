import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const PERMISSIONS = new Set(['external_message', 'content_publish', 'preview_deploy', 'production_deploy', 'production_change']);

async function ownerEmail() {
  const { data } = await auth.getSession();
  const email = data?.user?.email?.toLowerCase();
  return email && process.env.OWNER_EMAIL && email === process.env.OWNER_EMAIL.toLowerCase() ? email : null;
}

export async function GET() {
  const email = await ownerEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  try {
    const db = neon(process.env.DATABASE_URL);
    const grants = await db`
      SELECT g.id, g.grant_name, g.agent_key, a.display_name AS agent_name,
        g.client_id, c.business_name AS client_name, g.project_id,
        p.name AS project_name, g.resource_scope, g.environment,
        g.permissions, g.limits, g.status, g.max_uses, g.uses_count,
        g.starts_at, g.expires_at, g.revoked_at, g.approved_by,
        g.approval_reference, g.created_at
      FROM public.execution_grants g
      LEFT JOIN public.agency_agents a ON a.agent_key = g.agent_key
      LEFT JOIN public.clients c ON c.id = g.client_id
      LEFT JOIN public.projects p ON p.id = g.project_id
      ORDER BY g.created_at DESC LIMIT 200
    `;
    return NextResponse.json({ grants });
  } catch {
    return NextResponse.json({ error: 'Unable to load execution permissions.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const email = await ownerEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  try {
    const body = await request.json();
    if (body?.confirmed !== true) return NextResponse.json({ error: 'Explicit owner confirmation is required.' }, { status: 400 });
    const name = typeof body.grant_name === 'string' ? body.grant_name.trim() : '';
    const agentKey = typeof body.agent_key === 'string' ? body.agent_key.trim() : '';
    const scope = typeof body.resource_scope === 'string' ? body.resource_scope.trim() : '';
    const environment = body.environment;
    const permissions = Array.isArray(body.permissions) ? [...new Set(body.permissions)] : [];
    const expiresAt = typeof body.expires_at === 'string' ? new Date(body.expires_at) : null;
    const maxUses = body.max_uses == null ? null : Number(body.max_uses);
    const clientId = body.client_id || null;
    const projectId = body.project_id || null;
    const limits = body.limits && typeof body.limits === 'object' && !Array.isArray(body.limits) ? body.limits : {};

    if (name.length < 3 || name.length > 160 || scope.length < 3 || scope.length > 500) return NextResponse.json({ error: 'Grant name or scope is invalid.' }, { status: 400 });
    if (!['workspace', 'preview', 'production'].includes(environment)) return NextResponse.json({ error: 'Choose a valid execution environment.' }, { status: 400 });
    if (!permissions.length || permissions.length > 5 || permissions.some((p) => !PERMISSIONS.has(p))) return NextResponse.json({ error: 'Only supported non-financial execution permissions can be granted.' }, { status: 400 });
    if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: 'Grant expiry must be within the next 90 days.' }, { status: 400 });
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100000)) return NextResponse.json({ error: 'Maximum uses must be between 1 and 100,000.' }, { status: 400 });
    if (clientId && !/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: 'Invalid client ID.' }, { status: 400 });
    if (projectId && !/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: 'Invalid project ID.' }, { status: 400 });
    if (projectId && !clientId) return NextResponse.json({ error: 'A project grant must also identify its client.' }, { status: 400 });
    if (permissions.some((p) => ['preview_deploy', 'production_deploy', 'production_change'].includes(p)) && (!clientId || !projectId)) return NextResponse.json({ error: 'Website deployment and production-change grants must be bound to one client and one project.' }, { status: 400 });
    if (permissions.includes('production_deploy') && environment !== 'production') return NextResponse.json({ error: 'Production deployment permission requires the production environment.' }, { status: 400 });
    if (permissions.includes('preview_deploy') && environment !== 'preview') return NextResponse.json({ error: 'Preview deployment permission requires the preview environment.' }, { status: 400 });
    if (permissions.includes('production_change') && environment !== 'production') return NextResponse.json({ error: 'Live website changes require the production environment.' }, { status: 400 });
    if (JSON.stringify(limits).length > 4000) return NextResponse.json({ error: 'Execution limits are too large.' }, { status: 400 });

    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      WITH valid_agent AS (
        SELECT agent_key FROM public.agency_agents WHERE agent_key = ${agentKey} AND status IN ('ready','active')
      ), valid_client AS (
        SELECT id FROM public.clients WHERE id = ${clientId}::uuid
      ), valid_project AS (
        SELECT id FROM public.projects WHERE id = ${projectId}::uuid AND client_id = ${clientId}::uuid
      ), inserted AS (
        INSERT INTO public.execution_grants (
          grant_name, agent_key, client_id, project_id, resource_scope,
          environment, permissions, limits, approved_by, max_uses, expires_at
        )
        SELECT ${name}, valid_agent.agent_key, valid_client.id, valid_project.id,
          ${scope}, ${environment},
          ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(permissions)}::jsonb)),
          ${JSON.stringify(limits)}::jsonb, ${email}, ${maxUses}, ${expiresAt.toISOString()}::timestamptz
        FROM valid_agent
        LEFT JOIN valid_client ON ${clientId}::uuid IS NOT NULL
        LEFT JOIN valid_project ON ${projectId}::uuid IS NOT NULL
        WHERE (${clientId}::uuid IS NULL OR valid_client.id IS NOT NULL)
          AND (${projectId}::uuid IS NULL OR valid_project.id IS NOT NULL)
        RETURNING *
      )
      SELECT * FROM inserted
    `;
    if (!rows.length) return NextResponse.json({ error: 'Agent, client or project scope could not be verified.' }, { status: 409 });
    return NextResponse.json({ grant: rows[0], message: 'Scoped permission recorded. No external action has been executed.' }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to create the scoped permission safely.' }, { status: 500 });
  }
}
