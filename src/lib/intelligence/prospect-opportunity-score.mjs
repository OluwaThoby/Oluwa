export function scoreProspectOpportunity(input = {}) {
  const status = String(input.website_status || 'unknown').toLowerCase();
  const points = {
    none: 65,
    outdated: 50,
    unknown: 15,
    active: 8,
  };
  const score = points[status] ?? points.unknown;
  const reasons = {
    none: ['website_missing'],
    outdated: ['website_reported_outdated'],
    unknown: ['website_status_unverified'],
    active: ['website_reported_active'],
  };
  return {
    score,
    band: score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low',
    reasons: reasons[status] || reasons.unknown,
    basis: 'website_status_only',
    confidence: status === 'unknown' ? 'low' : 'provisional',
    note: 'A prioritisation signal based on the recorded website status, not a verified sales likelihood.',
  };
}
