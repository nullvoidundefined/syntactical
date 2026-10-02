// The judging criterion of an `ab` question, with the evidence behind it.
export type Criterion = {
  type: 'performance' | 'correctness' | 'readability';
  statement: string;
  evidence: string;
};
