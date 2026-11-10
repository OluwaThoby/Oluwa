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
 * Agency workflows depend on this contract, not on a vendor SDK. The current
 * hosted adapter is a temporary inference transport; a self-hosted student
 * model can implement the same contract without changing agency workflows.
 */
export interface AgencyModelRuntime {
  generate(request: AgencyTextRequest): Promise<AgencyTextResult>;
}

const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash-1017';

class VercelGatewayRuntime implements AgencyModelRuntime {
  async generate(request: AgencyTextRequest): Promise<AgencyTextResult> {
    const model = process.env.AI_GATEWAY_MODEL || DEFAULT_MODEL;
    const result = await generateText({
      model,
      system: request.system,
      prompt: request.prompt,
      ...(request.maxOutputTokens
        ? { maxOutputTokens: request.maxOutputTokens }
        : {}),
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
