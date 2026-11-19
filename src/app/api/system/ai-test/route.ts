import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateAgencyText } from '@/lib/intelligence/model-runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  if (!email || !process.env.OWNER_EMAIL ||
      email.toLowerCase() !== process.env.OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Synthetic prompt only: no prospect, client, or private workspace data is sent.
    const result = await generateAgencyText({
      taskType: 'general',
      system: 'You are testing the AgencyOS AI connection. Reply briefly and clearly.',
      prompt: 'Return exactly: AgencyOS AI connection is working.',
      maxOutputTokens: 80,
    });
    return NextResponse.json({
      success: Boolean(result.text?.trim()),
      model: result.model,
      response: result.text,
      usage: result.usage ?? null,
      testData: 'synthetic_only',
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'AI connection test failed.',
      testData: 'synthetic_only',
    }, { status: 502 });
  }
}
