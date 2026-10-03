export type ValidationStatus = 'passed' | 'failed' | 'not-executable';

export type ValidationFailureReason =
    | 'answer-mismatch'
    | 'ambiguous'
    | 'nondeterministic'
    | 'runner-error';

export interface ValidationResult {
    status: ValidationStatus;
    reason?: ValidationFailureReason;
    observed?: string;
    runtimeVersion?: string;
}
