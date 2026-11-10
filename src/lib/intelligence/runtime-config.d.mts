export type AgencyModelRuntimeReadiness = {
  runtime: string;
  configured: boolean;
  model: string | null;
  missing: string[];
};
export function getAgencyModelRuntimeReadiness(
  env?: Record<string, string | undefined>,
): AgencyModelRuntimeReadiness;
