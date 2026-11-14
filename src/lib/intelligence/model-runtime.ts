import { generateText } from 'ai';
import { MultiProviderRuntime } from './multi-provider-runtime';

export type AgencyTextRequest = {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  taskType?: string;
};

export type AgencyTextResult = {
  text: string;
  model: string;
  usage: unknown;
};

/**
 * Provider-neutral boundary for AgencyOS Intelligence.
 *
 * Agency workflows depend on this contract, not on a vendor SDK. Hosted
 * inference is an explicitly configured bridge; the self-hosted adapter can
 * point at an inference server running AgencyOS's own open-weight student.
 */
export interface AgencyModelRuntime {
  generate(request: AgencyTextRequest): Promise<AgencyTextResult>;
}

function outputLimit(request: AgencyTextRequest) {
  return Math.min(4000, Math.max(128, Math.floor(request.maxOutputTokens ?? 1200)));
}

function validateRequest(request: AgencyTextRequest) {
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
}

class VercelGatewayRuntime implements AgencyModelRuntime {
  async generate(request: AgencyTextRequest): Promise<AgencyTextResult> {
    validateRequest(request);
    const model = process.env.AI_GATEWAY_MODEL?.trim();

    // Never silently select a hosted model: model choice and any metered use
    // must be explicit in deployment configuration.
    if (!model) {
      throw new Error(
        'AI_GATEWAY_MODEL is not configured. Set it to an approved provider/model ID before enabling hosted inference.',
      );
    }

    if (!/^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9._-]*$/i.test(model)) {
      throw new Error(
        'AI_GATEWAY_MODEL must be an exact provider/model ID from the live AI Gateway catalog.',
      );
    }

    const result = await generateText({
      model,
      system: request.system,
      prompt: request.prompt,
      maxOutputTokens: outputLimit(request),
    });

    return {
      text: result.text,
      model,
      usage: result.usage ?? null,
    };
  }
}

/**
 * Adapter for an owner-operated OpenAI-compatible inference server (for
 * example vLLM or llama.cpp serving our own fine-tuned open-weight model).
 * This is a transport contract, not a dependency on OpenAI or another model
 * provider. The endpoint and model are explicitly supplied by the owner.
 */
class SelfHostedRuntime implements AgencyModelRuntime {
  async generate(request: AgencyTextRequest): Promise<AgencyTextResult> {
    validateRequest(request);

    const endpointValue = process.env.AGENCY_MODEL_ENDPOINT?.trim();
    const model = process.env.AGENCY_MODEL_NAME?.trim();
    const token = process.env.AGENCY_MODEL_TOKEN?.trim();

    if (!endpointValue || !model || !token) {
      throw new Error(
        'Self-hosted inference is not configured. Set the private endpoint, model name and access token.',
      );
    }

    let endpoint: URL;
    try {
      endpoint = new URL(endpointValue);
    } catch {
      throw new Error('AGENCY_MODEL_ENDPOINT must be a valid HTTPS inference URL.');
    }

    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if (
      !['https:', ...(process.env.NODE_ENV !== 'production' ? ['http:'] : [])].includes(endpoint.protocol) ||
      (process.env.NODE_ENV === 'production' && endpoint.protocol !== 'https:') ||
      (!localHost && endpoint.protocol !== 'https:') ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      !endpoint.pathname.endsWith('/v1/chat/completions')
    ) {
      throw new Error(
        'Self-hosted inference must use a trusted HTTPS /v1/chat/completions endpoint.',
      );
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
        max_tokens: outputLimit(request),
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(45000),
      cache: 'no-store',
    });

    if (!response.ok) {
      // Do not return upstream bodies: they may contain infrastructure details.
      throw new Error(
        response.status === 401 || response.status === 403
          ? 'Self-hosted inference rejected its configured credentials.'
          : `Self-hosted inference returned HTTP ${response.status}.`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
      usage?: unknown;
    };
    const content = payload.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('')
      : content;

    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Self-hosted inference returned no usable text output.');
    }

    return { text, model, usage: payload.usage ?? null };
  }
}

let runtime: AgencyModelRuntime | undefined;

/** Resolve lazily so tests and future self-hosted runtimes can replace the adapter. */
export function getAgencyModelRuntime(): AgencyModelRuntime {
  if (!runtime) {
    const runtimeKind = process.env.AGENCY_MODEL_RUNTIME || 'vercel-gateway';
    if (runtimeKind === 'vercel-gateway') {
      runtime = new VercelGatewayRuntime();
    } else if (runtimeKind === 'self-hosted') {
      runtime = new SelfHostedRuntime();
    } else if (runtimeKind === 'multi-provider') {
      runtime = new MultiProviderRuntime();
    } else {
      throw new Error(
        `Unsupported AGENCY_MODEL_RUNTIME "${runtimeKind}". No fallback to a third-party model is permitted.`,
      );
    }
  }
  return runtime;
}

export function setAgencyModelRuntimeForTests(next: AgencyModelRuntime | undefined) {
  runtime = next;
}

export async function generateAgencyText(request: AgencyTextRequest) {
  return getAgencyModelRuntime().generate(request);
}
