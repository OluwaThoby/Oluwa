export const SUPPORTED_AGENT_TASK_TYPES = Object.freeze([
  'prospect_research',
  'prospect_qualification',
  'seo_monitoring',
  'report_generation',
  'client_followup',
  'invoice_reminder',
  'general',
]);

const supported = new Set(SUPPORTED_AGENT_TASK_TYPES);

export function normalizeAgentTaskType(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return supported.has(candidate) ? candidate : 'general';
}
