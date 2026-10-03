// What classifying one question twice found: whether the two runs agreed, the lower
// confidence, the first run's topic, and why the result needs review (if it does).
export interface TwiceOutcome {
    confidence?: number;
    isAgreed?: boolean;
    reason?: 'disagreement' | 'low-confidence' | 'model-output-invalid';
    topic?: string;
}
