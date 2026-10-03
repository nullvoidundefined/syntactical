// The pipeline report shape that each run writes and the quality page reads.
import type { PipelineReportQuestion } from './PipelineReportQuestion.js';

// The JSON each pipeline run writes under `pipeline/reports/`; it feeds the quality page.
export interface PipelineReport {
    runId: string;
    stage: string;
    startedAt: string;
    finishedAt: string;
    questions: PipelineReportQuestion[];
    counts: Record<string, number>;
    agreement?: Record<string, number>;
}
