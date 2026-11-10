export function scoreProspectOpportunity(input = {}) {
  const auditScore = Number(input.audit_score);
  const auditFindings = Array.isArray(input.audit_findings) ? input.audit_findings : null;
  if (Number.isFinite(auditScore) && auditScore >= 0 && auditScore <= 100 && auditFindings) {
    const gaps = auditFindings.filter((finding) => finding && finding.severity && finding.severity !== 'pass');
    const high = gaps.filter((finding) => finding.severity === 'high').length;
    const medium = gaps.filter((finding) => finding.severity === 'medium').length;
    const low = gaps.filter((finding) => finding.severity === 'low').length;
    const score = Math.min(85, Math.max(0, Math.round((100 - auditScore) * 0.85)));
    return {
      score,
      band: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
      reasons: [
        ...(high ? [`${high}_high_severity_audit_gaps`] : []),
        ...(medium ? [`${medium}_medium_severity_audit_gaps`] : []),
        ...(low ? [`${low}_low_severity_audit_gaps`] : []),
      ],
      basis: 'public_html_audit',
      confidence: 'verified_limited_scope',
      note: 'Based on the latest public HTML inspection. This is not a full performance, accessibility or search-ranking audit.',
    };
  }

  const status = String(input.website_status || 'unknown').toLowerCase();
  const points = { none: 65, outdated: 50, unknown: 15, active: 8 };
  const reasons = {
    none: ['website_missing'],
    outdated: ['website_reported_outdated'],
    unknown: ['website_status_unverified'],
    active: ['website_reported_active'],
  };
  const score = points[status] ?? points.unknown;
  return {
    score,
    band: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
    reasons: reasons[status] || reasons.unknown,
    basis: 'website_status_only',
    confidence: status === 'unknown' ? 'low' : 'provisional',
    note: 'A prioritisation signal based on the recorded website status, not a verified sales likelihood.',
  };
}
