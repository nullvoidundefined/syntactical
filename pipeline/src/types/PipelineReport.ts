// The pipeline report shape that each run writes for the owner to read.
import type { PipelineReportQuestion } from './PipelineReportQuestion.js';

// The JSON each pipeline run writes under `pipeline/reports/`.
export interface PipelineReport {
    runId: string;
    stage: string;
    startedAt: string;
    finishedAt: string;
    questions: PipelineReportQuestion[];
    counts: Record<string, number>;
    agreement?: Record<string, number>;
    // Per-bank flags such as `python/easy: wtf-overuse`; ids and flag names only.
    flags?: string[];
}
