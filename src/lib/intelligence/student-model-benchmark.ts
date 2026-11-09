import type { Capability, ModelCapabilityProfile } from './types';

export type BenchmarkRun = {
  runId: string;
  model: ModelCapabilityProfile;
  capability: Capability;
  datasetVersion: string;
  split: 'development' | 'validation' | 'held_out_test';
  startedAt: string;
  completedAt?: string;
  sampleCount: number;
  passedCount: number;
  averageScore?: number;
  safetyFailures: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  tokensPerSecond?: number;
  estimatedCostUsd?: number;
  hardware: {
    accelerator?: string;
    acceleratorMemoryGb?: number;
    systemMemoryGb?: number;
    quantization?: string;
    inferenceEngine?: string;
  };
  notes: string[];
};

export function validateBenchmarkRun(run: BenchmarkRun): string[] {
  const errors: string[] = [];
  if (!run.runId) errors.push('Benchmark run ID is required.');
  if (!run.datasetVersion) errors.push('Dataset version is required.');
  if (run.sampleCount < 1) errors.push('At least one benchmark sample is required.');
  if (run.passedCount < 0 || run.passedCount > run.sampleCount) {
    errors.push('Passed count must be between zero and sample count.');
  }
  if (run.safetyFailures < 0 || run.safetyFailures > run.sampleCount) {
    errors.push('Safety failures must be between zero and sample count.');
  }
  if (run.split === 'held_out_test' && run.sampleCount < 10) {
    errors.push('Held-out comparison requires at least 10 samples per capability.');
  }
  if (run.averageScore !== undefined && (run.averageScore < 0 || run.averageScore > 100)) {
    errors.push('Average score must be between zero and 100.');
  }
  return errors;
}
