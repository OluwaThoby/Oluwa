import type { Capability, TaskRisk } from './types';

export type TeacherTraceStatus =
  | 'draft'
  | 'awaiting_review'
  | 'approved'
  | 'rejected'
  | 'quarantined';

export type TeacherTrace = {
  id: string;
  capability: Capability;
  task: string;
  response: string;
  teacher: {
    provider: string;
    model: string;
    modelVersion?: string;
  };
  provenance: {
    obtainedAt: string;
    accessMethod: 'official_api' | 'licensed_dataset' | 'human_authored' | 'other_permitted';
    termsReviewed: boolean;
    termsReference?: string;
    datasetLicense?: string;
    sourceRecord?: string;
  };
  review: {
    status: TeacherTraceStatus;
    reviewer?: string;
    reviewedAt?: string;
    correctness?: number;
    completeness?: number;
    safety?: number;
    notes?: string[];
    rejectionReason?: string;
  };
  risk: TaskRisk;
  tags: string[];
};

/**
 * Reject traces without a documented lawful source and explicit terms review.
 * This is a quality gate, not legal advice or a substitute for checking the
 * provider's current terms before collection and use.
 */
export function validateTeacherTrace(trace: TeacherTrace): string[] {
  const errors: string[] = [];
  if (!trace.id.trim()) errors.push('Trace ID is required.');
  if (!trace.task.trim()) errors.push('Task text is required.');
  if (!trace.response.trim()) errors.push('Teacher response is required.');
  if (!trace.teacher.provider.trim()) errors.push('Teacher provider is required.');
  if (!trace.teacher.model.trim()) errors.push('Teacher model is required.');
  if (!trace.provenance.obtainedAt) errors.push('Acquisition timestamp is required.');
  if (!trace.provenance.termsReviewed) errors.push('Provider/dataset terms must be reviewed.');
  if (
    trace.provenance.accessMethod === 'other_permitted' &&
    !trace.provenance.termsReference
  ) {
    errors.push('A terms or permission reference is required for this access method.');
  }
  if (
    trace.review.status === 'approved' &&
    (!trace.review.reviewer || !trace.review.reviewedAt)
  ) {
    errors.push('Approved traces require a reviewer and review timestamp.');
  }
  if (
    trace.review.status === 'approved' &&
    [trace.review.correctness, trace.review.completeness, trace.review.safety].some(
      (score) => typeof score !== 'number' || score < 0 || score > 100,
    )
  ) {
    errors.push('Approved traces require correctness, completeness and safety scores from 0 to 100.');
  }
  return errors;
}
