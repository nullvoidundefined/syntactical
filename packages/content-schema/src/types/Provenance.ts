// Where a question came from and how it was checked.
export type Provenance = {
  source: 'original' | 'generated';
  model?: string;
  promptVersion?: string;
  runtimeVersion?: string;
  validation: { method: 'executed' | 'judged'; status: 'pending' | 'passed' | 'failed' };
  isHumanReviewed: boolean;
};
