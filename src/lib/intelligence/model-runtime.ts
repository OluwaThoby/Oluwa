import { generateText } from 'ai';

export type AgencyTextRequest = {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
};

export type AgencyTextResult = {
  text: string;
  model: string;
  usage: unknown;
};

/**
 * Provider-neutral boundary for AgencyOS Intelligence.
 *
 * Agency workflows depend on this contract, not on a vendor SDK. The hosted
 * adapter is temporary inference transport; a self-hosted student model can
 * implement the same contract without changing agency workflows.
 */
export interface AgencyModelRuntime {
  generate(request: AgencyTextRequest): Promise<AgencyTextResult>;
}

class VercelGatewayRuntime implements AgencyModelRuntime {
  async generate(request: AgencyTextRequest): Promise<AgencyTextResult> {
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

    const maxOutputTokens = Math.min(
      4000,
      Math.max(128, Math.floor(request.maxOutputTokens ?? 1200)),
    );

    const result = await generateText({
      model,
      system: request.system,
      prompt: request.prompt,
      maxOutputTokens,
    });

    return {
      text: result.text,
      model,
      usage: result.usage ?? null,
    };
  }
}

let runtime: AgencyModelRuntime | undefined;

/** Resolve lazily so tests and future self-hosted runtimes can replace the adapter. */
export function getAgencyModelRuntime(): AgencyModelRuntime {
  if (!runtime) {
    const runtimeKind = process.env.AGENCY_MODEL_RUNTIME || 'vercel-gateway';
    if (runtimeKind !== 'vercel-gateway') {
      throw new Error(
        `Unsupported AGENCY_MODEL_RUNTIME "${runtimeKind}". No fallback to a third-party model is permitted.`,
      );
    }
    runtime = new VercelGatewayRuntime();
  }
  return runtime;
}

export function setAgencyModelRuntimeForTests(next: AgencyModelRuntime | undefined) {
  runtime = next;
}

export async function generateAgencyText(request: AgencyTextRequest) {
  return getAgencyModelRuntime().generate(request);
}
