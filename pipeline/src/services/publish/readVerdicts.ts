// Turns the latest pipeline report (which carries the validate verdicts forward through the
// later stages) into bank key to question id to verdict. No report means no verdicts, so only
// human-reviewed questions and ones whose own provenance records a passing run can publish.
import type { PipelineReport } from '../../types/PipelineReport.js';
import type { PublishVerdict } from '../../types/publish/PublishVerdict.js';

export function readVerdicts(report: PipelineReport | null): Map<string, Map<string, PublishVerdict>> {
    const verdicts = new Map<string, Map<string, PublishVerdict>>();
    for (const { bankKey, id, runtimeVersion, status } of report?.questions ?? []) {
        const bank = verdicts.get(bankKey) ?? new Map<string, PublishVerdict>();
        bank.set(id, { status, ...(runtimeVersion === undefined ? {} : { runtimeVersion }) });
        verdicts.set(bankKey, bank);
    }
    return verdicts;
}
