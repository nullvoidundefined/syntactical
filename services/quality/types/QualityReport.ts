// What the build bundles from the committed pipeline report for the quality page.
import type { BankQuality } from './BankQuality';
import type { QualityReportSummary } from './QualityReportSummary';

export type QualityReport = { banks: BankQuality[]; finishedAt: string; runId: string; summary: QualityReportSummary };
