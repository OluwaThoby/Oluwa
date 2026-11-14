export type AgencyModelRuntimeReadiness = {
  runtime: string;
  configured: boolean;
  model: string | null;
  missing: string[];
  providers?: string[];
  routes?: Record<string, string>;
};

export type AgencyProviderRoute = {
  task: string;
  routeName: string;
  provider: string;
};

export function getAgencyModelRuntimeReadiness(
  env?: Record<string, string | undefined>,
): AgencyModelRuntimeReadiness;

export function resolveAgencyProviderForTask(
  taskType?: string,
  env?: Record<string, string | undefined>,
): AgencyProviderRoute;
