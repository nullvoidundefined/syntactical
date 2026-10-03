// The report-wide numbers the quality page shows.
export type QualityReportSummary = {
  agreement: Record<string, number>;
  audited: number;
  auditFailuresInOriginal: number;
  humanReviewRate: number;
  methodMix: Record<string, number>;
  rejectedByReason: Record<string, number>;
};
