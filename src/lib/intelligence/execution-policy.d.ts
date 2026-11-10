export type ExecutionPermission = 'external_message' | 'content_publish' | 'production_deploy' | 'production_change' | 'financial_action' | 'data_destructive';
export type ActionClassification = {
  permissions: ExecutionPermission[];
  highestRisk: 'low' | 'high' | 'critical';
  requiresExplicitApproval: boolean;
  financialApprovalRequired: boolean;
  executionGranted: false;
};
export function classifyRequestedActions(text?: string): ActionClassification;
export function evaluateExecutionGrant(input: {
  permission: ExecutionPermission;
  grant?: { permissions?: ExecutionPermission[]; scope?: string; expiresAt?: string; revokedAt?: string | null; maxUses?: number | null; uses?: number };
  now?: Date;
}): { allowed: boolean; reason: string };
