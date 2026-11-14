import type { AgencyModelRuntime, AgencyTextRequest, AgencyTextResult } from './model-runtime';
import { resolveAgencyProviderForTask } from './runtime-config.mjs';

type Provider = 'gemini' | 'groq' | 'openrouter';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the selected AI provider.`);
  return value;
}

function maxTokens(request: AgencyTextRequest) {
  return Math.min(4000, Math.max(128, Math.floor(request.maxOutputTokens ?? 1200)));
}

async function openAICompatible(
  provider: 'groq' | 'openrouter',
  request: AgencyTextRequest,
): Promise<AgencyTextResult> {
  const isGroq = provider === 'groq';
  const key = required(isGroq ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY');
  const model = required(isGroq ? 'GROQ_MODEL' : 'OPENROUTER_MODEL');
  const endpoint = isGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(isGroq ? {} : {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://agencyos.local',
        'X-Title': 'AgencyOS',
      }),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.prompt },
      ],
      max_tokens: maxTokens(request),
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(45000),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`${provider} inference returned HTTP ${response.status}; check provider quota, model access and configuration.`);
  }
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    usage?: unknown;
  };
  const content = payload.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('')
    : content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(`${provider} returned no usable text output.`);
  }
  return { text, model: `${provider}/${model}`, usage: payload.usage ?? null };
}

async function gemini(
  request: AgencyTextRequest,
): Promise<AgencyTextResult> {
  const key = required('GEMINI_API_KEY');
  const model = required('GEMINI_MODEL');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let response: Response | undefined;
  let lastDetail = '';
  const retryableStatuses = new Set([429, 500, 502, 503, 504]);

  // Google can briefly return 503 during model-capacity spikes. Retry once
  // inside the API route's execution budget; never switch vendors silently.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-goog-api-key': key,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens(request), temperature: 0.2 },
        }),
        // Two bounded attempts plus backoff stay below the route's 60-second limit.
        signal: AbortSignal.timeout(24000),
        cache: 'no-store',
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new Error('Gemini did not respond within 24 seconds. This is a provider/network timeout, not an API-key rejection. Retry later or use another configured provider.');
      }
      throw error;
    }

    if (response.ok || !retryableStatuses.has(response.status) || attempt === 1) break;

    // Read the first response now so its diagnostic body is not lost.
    try {
      const body = await response.clone().json() as { error?: { message?: string; status?: string } };
      lastDetail = [body.error?.status, body.error?.message]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join(': ')
        .slice(0, 1200);
    } catch {
      lastDetail = '';
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  if (!response) throw new Error('Gemini request did not return a response.');
  if (!response.ok) {
    let detail = lastDetail;
    if (!detail) {
      try {
        const body = await response.json() as { error?: { message?: string; status?: string } };
        detail = [body.error?.status, body.error?.message]
          .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
          .join(': ')
          .slice(0, 1200);
      } catch {
        detail = '';
      }
    }
    const capacityHint = response.status === 503
      ? ' Google reports temporary model capacity pressure; this does not indicate an invalid API key.'
      : response.status === 429
        ? ' Google reports a rate or quota limit for this project.'
        : '';
    throw new Error(
      `Gemini inference returned HTTP ${response.status}${detail ? ` — ${detail}` : ''}.${capacityHint} Check the Google AI Studio usage limits if this persists.`,
    );
  }
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: unknown;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
  if (!text?.trim()) throw new Error('Gemini returned no usable text output.');
  return { text, model: `gemini/${model}`, usage: payload.usageMetadata ?? null };
}

/**
 * Run a synthetic, provider-specific smoke test. This deliberately bypasses
 * task routing so the owner can verify each configured provider independently.
 */
export async function runAgencyProviderSmokeTest(provider: Provider) {
  const startedAt = Date.now();
  const request: AgencyTextRequest = {
    system: 'You are performing a synthetic AgencyOS connectivity check. Do not use tools or external data.',
    prompt: 'Reply with exactly: AGENCYOS_PROVIDER_OK',
    maxOutputTokens: 48,
  };
  const result = provider === 'gemini'
    ? await gemini(request)
    : await openAICompatible(provider, request);
  return {
    provider,
    model: result.model,
    latencyMs: Date.now() - startedAt,
    response: result.text,
    success: result.text.includes('AGENCYOS_PROVIDER_OK'),
    testData: 'synthetic_only' as const,
  };
}

/**
 * Explicit task router. No automatic cross-provider fallback: a failed request
 * stays failed rather than silently sending client data to another vendor.
 * Route overrides allow benchmark results to change assignments without code edits.
 */
export class MultiProviderRuntime implements AgencyModelRuntime {
  async generate(request: AgencyTextRequest): Promise<AgencyTextResult> {
    if (
      typeof request.system !== 'string' ||
      typeof request.prompt !== 'string' ||
      !request.system.trim() ||
      !request.prompt.trim() ||
      request.system.length > 20000 ||
      request.prompt.length > 20000
    ) {
      throw new Error('The AI request is empty or exceeds the allowed input size.');
    }

    const route = resolveAgencyProviderForTask(request.taskType || 'general');
    const provider = route.provider as Provider;
    if (!['gemini', 'groq', 'openrouter'].includes(provider)) {
      throw new Error(`Unsupported provider in ${route.routeName}.`);
    }

    if (provider === 'gemini') return gemini(request);
    if (provider === 'groq') return openAICompatible('groq', request);
    return openAICompatible('openrouter', request);
  }
}
