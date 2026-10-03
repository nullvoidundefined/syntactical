// Builds the enrich stage's pipeline report. It carries the previous report's validate
// verdicts, counts, and agreement rates forward (the quality build needs every bank's
// verdicts) and adds its own counts and `agreement.enrich`, the rate at which two
// independent tagging runs chose the same misconception for a wrong choice. `enrich` is
// the stage's own name and is already an allowed agreement key in buildContentManifest.
import type { EnrichBankResult } from '../../types/EnrichBankResult.js';
import type { PipelineReport } from '../../types/PipelineReport.js';

const STAGE = 'enrich';

export function buildEnrichReport(
    previous: PipelineReport | null,
    totals: EnrichBankResult,
    meta: Pick<PipelineReport, 'finishedAt' | 'runId' | 'startedAt'>,
): PipelineReport {
    const { accepted, agreed, compared, contradicted, dropped } = totals;
    const { agreement, counts, questions } = previous ?? { counts: {}, questions: [] };
    // With nothing compared this run, drop any earlier `enrich` rate instead of republishing it.
    const { enrich: _stale, ...otherAgreement } = agreement ?? {};
    const merged = { ...otherAgreement, ...(compared > 0 ? { enrich: agreed / compared } : {}) };
    return {
        ...meta,
        counts: {
            ...counts,
            'enrich-accepted': accepted,
            'enrich-dropped': dropped,
            'rationale-contradicts-oracle': contradicted,
        },
        questions,
        stage: STAGE,
        ...(Object.keys(merged).length > 0 ? { agreement: merged } : {}),
    };
}
