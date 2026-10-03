// The publish stage's pipeline report. It carries the previous report's validate verdicts,
// counts, and agreement rates forward (the quality build needs every bank's verdicts) and adds
// how many banks and questions this run wrote and refused.
import type { PipelineReport } from '../../types/PipelineReport.js';
import type { PublishBankResult } from '../../types/publish/PublishBankResult.js';

const STAGE = 'publish';

export function buildPublishReport(
    previous: PipelineReport | null,
    results: PublishBankResult[],
    meta: Pick<PipelineReport, 'finishedAt' | 'runId' | 'startedAt'>,
): PipelineReport {
    const { agreement, counts, questions } = previous ?? { counts: {}, questions: [] };
    const written = results.filter(({ isWritten }) => isWritten);
    return {
        ...meta,
        counts: {
            ...counts,
            'publish-banks-refused': results.length - written.length,
            'publish-banks-written': written.length,
            'publish-questions-refused': results.reduce((sum, { refused }) => sum + refused.length, 0),
            'publish-questions-written': written.reduce((sum, { written: count }) => sum + count, 0),
        },
        questions,
        stage: STAGE,
        ...(agreement === undefined ? {} : { agreement }),
    };
}
