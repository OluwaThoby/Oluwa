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
  const response = await fetch(endpoint, {
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
    signal: AbortSignal.timeout(45000),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Gemini inference returned HTTP ${response.status}; check API access, quota and model configuration.`);
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
