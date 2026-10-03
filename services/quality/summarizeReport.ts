// Reduces a pipeline report to the numbers the quality page shows. A failed
// verdict is an audit failure in the original bank. A question with no
// executable oracle was judged rather than executed, and only those need a
// human review: publish refuses a failed question even when human-reviewed
// (B-22), so failed questions never enter review.
import type { PipelineReportInput } from './types/PipelineReportInput';
import type { QualityReportSummary } from './types/QualityReportSummary';

const NO_REASON = 'unspecified';

function countBy<Item>(items: readonly Item[], keyOf: (item: Item) => string): Record<string, number> {
  const counts: Record<string, number> = Object.create(null);
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function summarizeReport(report: PipelineReportInput): QualityReportSummary {
  const { agreement = {}, questions } = report;
  const failed = questions.filter(({ status }) => status === 'failed');
  const needReview = questions.filter(({ status }) => status === 'not-executable');
  return {
    agreement: { ...agreement },
    auditFailuresInOriginal: failed.length,
    audited: questions.length,
    humanReviewRate: questions.length === 0 ? 0 : needReview.length / questions.length,
    methodMix: countBy(questions, ({ status }) => (status === 'not-executable' ? 'judged' : 'executed')),
    rejectedByReason: countBy(failed, ({ reason }) => reason ?? NO_REASON),
  };
}
