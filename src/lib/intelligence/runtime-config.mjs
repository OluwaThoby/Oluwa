const TASK_DEFAULT_PROVIDERS = Object.freeze({
  prospect_research: 'gemini',
  prospect_qualification: 'gemini',
  seo_monitoring: 'groq',
  report_generation: 'gemini',
  client_followup: 'groq',
  invoice_reminder: 'groq',
  general: 'gemini',
});

/**
 * Resolve every task through an explicit task route. Unknown task types use
 * the general route rather than silently falling back to a different vendor.
 */
export function resolveAgencyProviderForTask(taskType = 'general', env = process.env) {
  const task = Object.hasOwn(TASK_DEFAULT_PROVIDERS, taskType) ? taskType : 'general';
  const routeName = `AGENCY_ROUTE_${task.toUpperCase()}`;
  const override = env[routeName];
  const provider = typeof override === 'string' && override.trim()
    ? override.trim()
    : TASK_DEFAULT_PROVIDERS[task];
  return { task, routeName, provider };
}

/**
 * Shared, secret-safe configuration check for the selected AgencyOS inference
 * runtime. Presence checks never reveal credentials and do not prove provider
 * connectivity, quota, model availability, or model ownership.
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

  if (runtime === 'multi-provider') {
    const tasks = [
      'prospect_research',
      'prospect_qualification',
      'seo_monitoring',
      'report_generation',
      'client_followup',
      'invoice_reminder',
      'general',
    ];
    const missing = new Set();
    const routes = {};

    for (const task of tasks) {
      const { routeName, provider } = resolveAgencyProviderForTask(task, env);
      routes[task] = provider;
      if (provider === 'gemini') {
        if (!env.GEMINI_API_KEY?.trim()) missing.add('GEMINI_API_KEY');
        if (!env.GEMINI_MODEL?.trim()) missing.add('GEMINI_MODEL');
      } else if (provider === 'groq') {
        if (!env.GROQ_API_KEY?.trim()) missing.add('GROQ_API_KEY');
        if (!env.GROQ_MODEL?.trim()) missing.add('GROQ_MODEL');
      } else if (provider === 'openrouter') {
        if (!env.OPENROUTER_API_KEY?.trim()) missing.add('OPENROUTER_API_KEY');
        if (!env.OPENROUTER_MODEL?.trim()) missing.add('OPENROUTER_MODEL');
      } else {
        missing.add(`${routeName} must be gemini, groq, or openrouter`);
      }
    }

    const providers = [...new Set(Object.values(routes))];
    const models = providers.map((provider) => {
      if (provider === 'gemini') return `gemini/${env.GEMINI_MODEL?.trim() || 'unconfigured'}`;
      if (provider === 'groq') return `groq/${env.GROQ_MODEL?.trim() || 'unconfigured'}`;
      return `openrouter/${env.OPENROUTER_MODEL?.trim() || 'unconfigured'}`;
    });

    return {
      runtime,
      configured: missing.size === 0,
      model: models.join(', '),
      providers,
      routes,
      missing: [...missing],
    };
  }

  return {
    runtime,
    configured: false,
    model: null,
    missing: ['Supported runtime: vercel-gateway, self-hosted, or multi-provider'],
  };
}
