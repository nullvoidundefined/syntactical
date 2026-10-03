// The slice of a pipeline report the quality page reads. Ids and verdicts only,
// mirroring pipeline/src/types/PipelineReport.ts without importing the pipeline workspace.
export type PipelineReportInput = {
  agreement?: Record<string, number>;
  finishedAt: string;
  questions: { bankKey: string; id: string; reason?: string; runtimeVersion?: string; status: string }[];
  runId: string;
};
