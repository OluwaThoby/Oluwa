export type ExecutionPermission = 'external_message' | 'content_publish' | 'production_deploy' | 'production_change' | 'financial_action' | 'data_destructive';
export type ActionClassification = {
  permissions: ExecutionPermission[];
  highestRisk: 'low' | 'high' | 'critical';
  requiresExplicitApproval: boolean;
  financialApprovalRequired: boolean;
  executionGranted: false;
};
export type ExecutionGrantState = {
  permissions?: ExecutionPermission[];
  scope?: string;
  status?: 'active' | 'revoked' | 'expired' | 'exhausted' | string;
  startsAt?: string;
  expiresAt?: string;
  revokedAt?: string | null;
  maxUses?: number | null;
  uses?: number;
  agentKey?: string;
  clientId?: string | null;
  projectId?: string | null;
  environment?: 'workspace' | 'preview' | 'production';
  resourceRef?: string;
};
export type ExecutionGrantExpectation = Partial<Pick<ExecutionGrantState, 'agentKey' | 'clientId' | 'projectId' | 'environment' | 'resourceRef'>>;
export function classifyRequestedActions(text?: string): ActionClassification;
export function evaluateExecutionGrant(input: {
  permission: ExecutionPermission;
  grant?: ExecutionGrantState;
  now?: Date;
  expected?: ExecutionGrantExpectation;
}): { allowed: boolean; reason: string };

export type PersistedExecutionGrantRow = {
  id?: string;
  status?: string;
  permissions?: unknown;
  resource_scope?: string;
  starts_at?: string | Date;
  expires_at?: string | Date;
  revoked_at?: string | Date | null;
  max_uses?: number | null;
  uses_count?: number;
  agent_key?: string;
  client_id?: string | null;
  project_id?: string | null;
  environment?: 'workspace' | 'preview' | 'production' | string;
  resource_ref?: string;
};
export function normalizeExecutionGrant(row: PersistedExecutionGrantRow | null | undefined): ExecutionGrantState | null;
