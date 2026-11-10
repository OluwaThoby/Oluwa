import { NextResponse } from 'next/server';
import { resolveTxt } from 'node:dns/promises';
import { auth } from '@/lib/auth';
import { checkEmailDnsAuthentication } from '@/lib/email/dns-auth-check.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  if (!email || !process.env.OWNER_EMAIL || email.toLowerCase() !== process.env.OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const result = await checkEmailDnsAuthentication({
      domain: body.domain,
      fromAddress: body.from_address,
      dkimSelector: body.dkim_selector,
      lookupTxt: resolveTxt,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'dns_check_failed';
    const clientErrors = new Set(['invalid_domain', 'invalid_from_address', 'from_domain_mismatch', 'invalid_dkim_selector']);
    if (clientErrors.has(code)) return NextResponse.json({ error: code }, { status: 400 });
    return NextResponse.json({ error: 'DNS lookup failed. Retry shortly; no sender settings were changed.' }, { status: 502 });
  }
}
