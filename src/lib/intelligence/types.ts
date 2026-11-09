/**
 * AgencyOS Intelligence — core contracts.
 *
 * The intelligence runtime is deliberately independent of any one model vendor.
 * Teacher models are used in the offline research/distillation pipeline; the
 * deployed student runtime will be replaceable without changing agency tools.
 */

export type Capability =
  | 'reasoning'
  | 'research'
  | 'software_engineering'
  | 'web_design'
  | 'seo'
  | 'sales'
  | 'writing'
  | 'document_analysis'
  | 'vision'
  | 'planning'
  | 'verification';

export type TaskRisk = 'low' | 'medium' | 'high' | 'critical';

export type IntelligenceTask = {
  id: string;
  capability: Capability;
  objective: string;
  context?: Record<string, unknown>;
  risk: TaskRisk;
  acceptanceCriteria: string[];
  maxSteps: number;
  requiresHumanApproval: boolean;
};

export type ModelCapabilityProfile = {
  modelId: string;
  family: string;
  capabilities: Partial<Record<Capability, number>>;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
  deployment: 'local' | 'hosted' | 'training_only';
  costClass: 'zero_marginal' | 'low' | 'medium' | 'high' | 'unknown';
  verifiedAt?: string;
};

export type EvaluationCase = {
  id: string;
  capability: Capability;
  title: string;
  prompt: string;
  expectedBehaviours: string[];
  prohibitedBehaviours: string[];
  risk: TaskRisk;
  scoreWeights: {
    correctness: number;
    completeness: number;
    clarity: number;
    safety: number;
  };
};

export type EvaluationScore = {
  caseId: string;
  correctness: number;
  completeness: number;
  clarity: number;
  safety: number;
  notes: string[];
};

export type ExecutionPermission =
  | 'read_workspace'
  | 'write_workspace'
  | 'research_public_web'
  | 'send_external_message'
  | 'spend_money'
  | 'modify_production'
  | 'deploy_production';

export type ApprovalDecision = {
  permission: ExecutionPermission;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  scope?: string;
};
