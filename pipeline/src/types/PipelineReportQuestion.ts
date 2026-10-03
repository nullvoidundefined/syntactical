// One question's outcome in a pipeline report (ids and verdicts only).
import type { ValidationFailureReason, ValidationStatus } from './ValidationResult.js';

// One question's outcome in a pipeline report. Ids and verdicts only: no
// prompt, choice, code, or explanation text is ever copied here.
export interface PipelineReportQuestion {
    id: string;
    bankKey: string;
    status: ValidationStatus;
    reason?: ValidationFailureReason;
    runtimeVersion?: string;
}
