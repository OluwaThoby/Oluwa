import type { Capability, ModelCapabilityProfile, TaskRisk } from './types';

/**
 * Scores a model profile for a task capability. Profiles must be backed by
 * repeatable evaluations; marketing claims are not capability evidence.
 */
export function scoreModelForCapability(
  profile: ModelCapabilityProfile,
  capability: Capability,
  risk: TaskRisk,
): number {
  const raw = profile.capabilities[capability] ?? 0;
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) return 0;

  // High-risk tasks require a verified evaluation record before selection.
  if ((risk === 'high' || risk === 'critical') && !profile.verifiedAt) return 0;
  if (profile.deployment === 'training_only') return 0;

  return raw;
}

export function rankModels(
  profiles: ModelCapabilityProfile[],
  capability: Capability,
  risk: TaskRisk,
): ModelCapabilityProfile[] {
  return [...profiles]
    .filter((profile) => scoreModelForCapability(profile, capability, risk) > 0)
    .sort(
      (a, b) =>
        scoreModelForCapability(b, capability, risk) -
        scoreModelForCapability(a, capability, risk),
    );
}

/**
 * These permissions are intentionally never inferred from model confidence.
 * A human approval record is required for consequential external actions.
 */
export function isPermissionApproved(
  permission: string,
  approvals: Array<{ permission: string; approved: boolean }>,
): boolean {
  return approvals.some(
    (approval) => approval.permission === permission && approval.approved,
  );
}
