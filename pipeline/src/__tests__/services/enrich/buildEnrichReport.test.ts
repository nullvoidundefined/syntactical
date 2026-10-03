// The enrich report's agreement handling.
import { describe, expect, it } from 'vitest';

import { buildEnrichReport } from '../../../services/enrich/buildEnrichReport.js';
import type { PipelineReport } from '../../../types/PipelineReport.js';

const META = { finishedAt: 'f', runId: 'r', startedAt: 's' };
const NOTHING = { accepted: 0, agreed: 0, compared: 0, contradicted: 0, dropped: 0 };
const PREVIOUS: PipelineReport = {
    ...META,
    agreement: { classify: 0.9, enrich: 0.8 },
    counts: { passed: 3 },
    questions: [],
    stage: 'classify',
};

describe('buildEnrichReport', () => {
    it('drops a stale enrich agreement when nothing was compared, keeping other stages', () => {
        expect(buildEnrichReport(PREVIOUS, NOTHING, META).agreement).toEqual({ classify: 0.9 });
    });

    it('omits agreement entirely when nothing was compared and nothing else is carried', () => {
        expect(buildEnrichReport(null, NOTHING, META)).not.toHaveProperty('agreement');
    });

    it('replaces the earlier enrich rate with this run\'s when something was compared', () => {
        const report = buildEnrichReport(PREVIOUS, { ...NOTHING, agreed: 1, compared: 4 }, META);
        expect(report.agreement).toEqual({ classify: 0.9, enrich: 0.25 });
    });
});
