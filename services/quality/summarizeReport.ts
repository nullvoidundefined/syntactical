// Reduces a pipeline report to the numbers the quality page shows. A failed
// verdict is an audit failure in the original bank; a question with no
// executable oracle was judged rather than executed; every question that did
// not pass execution needs a human review before it can be published.
import type { BankQuality } from './types/BankQuality';
import type { PipelineReportInput } from './types/PipelineReportInput';
import type { QualityReportSummary } from './types/QualityReportSummary';

const NO_REASON = 'unspecified';

function countBy<Item>(items: readonly Item[], keyOf: (item: Item) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function summarizeReport(report: PipelineReportInput): QualityReportSummary {
  const { agreement = {}, questions } = report;
  const failed = questions.filter(({ status }) => status === 'failed');
  const needReview = questions.filter(({ status }) => status !== 'passed');
  return {
    agreement: { ...agreement },
    audited: questions.length,
    auditFailuresInOriginal: failed.length,
    humanReviewRate: questions.length === 0 ? 0 : needReview.length / questions.length,
    methodMix: countBy(questions, ({ status }) => (status === 'not-executable' ? 'judged' : 'executed')),
    rejectedByReason: countBy(failed, ({ reason }) => reason ?? NO_REASON),
  };
}

export function summarizeBanks(report: PipelineReportInput): BankQuality[] {
  const banks = new Map<string, BankQuality>();
  for (const { bankKey, status } of report.questions) {
    const bank = banks.get(bankKey) ?? { audited: 0, bankKey, failed: 0, notExecutable: 0, passed: 0 };
    bank.audited += 1;
    if (status === 'passed') bank.passed += 1;
    if (status === 'failed') bank.failed += 1;
    if (status === 'not-executable') bank.notExecutable += 1;
    banks.set(bankKey, bank);
  }
  return [...banks.values()].sort((left, right) => (left.bankKey < right.bankKey ? -1 : 1));
}
