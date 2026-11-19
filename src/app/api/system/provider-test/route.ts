import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runAgencyProviderSmokeTest } from '@/lib/intelligence/multi-provider-runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  if (!email || !process.env.OWNER_EMAIL ||
      email.toLowerCase() !== process.env.OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Explicit opt-in prevents an innocent dashboard click from creating
  // provider usage. Enable only after confirming the selected models use
  // free-tier quota; this route never performs cross-provider fallback.
  if (process.env.AGENCY_PROVIDER_TESTS_ENABLED !== 'true') {
    return NextResponse.json({
      error: 'Provider smoke tests are disabled. Enable AGENCY_PROVIDER_TESTS_ENABLED only after confirming free-tier model access.',
    }, { status: 409 });
  }

  let provider: unknown;
  try {
    ({ provider } = await request.json());
  } catch {
    return NextResponse.json({ error: 'A valid provider is required.' }, { status: 400 });
  }
  if (provider !== 'gemini' && provider !== 'groq' && provider !== 'openrouter') {
    return NextResponse.json({ error: 'Unsupported provider.' }, { status: 400 });
  }

  try {
    const result = await runAgencyProviderSmokeTest(provider);
    if (!result.success) {
      return NextResponse.json({
        ...result,
        success: false,
        error: 'The provider responded, but did not return the expected test marker.',
      }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      success: false,
      provider,
      testData: 'synthetic_only',
      error: error instanceof Error ? error.message : 'Provider smoke test failed.',
    }, { status: 502 });
  }
}
