// Counts each verdict in a pipeline report per bank, sorted by bank key.
import type { BankQuality } from './types/BankQuality';
import type { PipelineReportInput } from './types/PipelineReportInput';

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
