/**
 * Shared, secret-safe configuration check for the selected AgencyOS inference
 * runtime. This reports presence only; it does not prove connectivity or model
 * ownership.
 */
export function getAgencyModelRuntimeReadiness(env = process.env) {
  const runtime = (env.AGENCY_MODEL_RUNTIME || 'vercel-gateway').trim();
  if (runtime === 'self-hosted') {
    const missing = [
      ['AGENCY_MODEL_ENDPOINT', env.AGENCY_MODEL_ENDPOINT],
      ['AGENCY_MODEL_NAME', env.AGENCY_MODEL_NAME],
      ['AGENCY_MODEL_TOKEN', env.AGENCY_MODEL_TOKEN],
    ].filter(([, value]) => typeof value !== 'string' || !value.trim()).map(([key]) => key);
    return {
      runtime,
      configured: missing.length === 0,
      model: env.AGENCY_MODEL_NAME?.trim() || null,
      missing,
    };
  }
  if (runtime === 'vercel-gateway') {
    const missing = [];
    if (!env.AI_GATEWAY_MODEL?.trim()) missing.push('AI_GATEWAY_MODEL');
    if (!env.AI_GATEWAY_API_KEY?.trim() && !env.VERCEL_OIDC_TOKEN?.trim()) {
      missing.push('AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN');
    }
    return {
      runtime,
      configured: missing.length === 0,
      model: env.AI_GATEWAY_MODEL?.trim() || null,
      missing,
    };
  }
  return {
    runtime,
    configured: false,
    model: null,
    missing: ['Supported runtime: vercel-gateway or self-hosted'],
  };
}
