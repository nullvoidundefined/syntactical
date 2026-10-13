// `pipeline validate`: runs every question's oracle through `validateQuestion`
// and writes a pipeline report. It reads content files and never writes them.
import { dirname, join } from 'node:path';

import type { Question } from '@syntactical/content-schema';

import type { Oracle } from '../types/Oracle.js';
import type { OracleSource } from '../types/OracleSource.js';
import type { PipelineReport } from '../types/PipelineReport.js';
import type { PipelineReportQuestion } from '../types/PipelineReportQuestion.js';
import type { ValidationResult, ValidationStatus } from '../types/ValidationResult.js';
import { listBankEntries } from '../services/content/listBankEntries.js';
import { loadValidatedManifest } from '../services/content/loadValidatedManifest.js';
import { readBankQuestions } from '../services/content/readBankQuestions.js';
import { createOracleSource } from '../services/createOracleSource.js';
import { resolveBankFile } from '../services/resolveBankFile.js';
import { resolveBankOutputRoot } from '../services/resolveBankOutputRoot.js';
import { validateQuestion } from '../services/validateQuestion.js';
import { writePipelineReport } from '../services/writePipelineReport.js';

export type QuestionValidator = (question: Question, oracle: Oracle | null) => Promise<ValidationResult>;

export interface ValidateOptions {
    contentDir: string;
    // The private content repo that holds paid banks (B-60).
    contentRoot: string;
    reportsDir: string;
    oracleSource?: OracleSource;
    pipelineDir?: string;
    newRunId: () => string;
    now: () => string;
    validate?: QuestionValidator;
}

const STAGE = 'validate';

const STATUSES: ValidationStatus[] = ['passed', 'failed', 'not-executable'];

function toReportQuestion(id: string, bankKey: string, result: ValidationResult): PipelineReportQuestion {
    const { reason, runtimeVersion, status } = result;
    return {
        bankKey,
        id,
        status,
        ...(reason === undefined ? {} : { reason }),
        ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
    };
}

export async function validateContent(options: ValidateOptions): Promise<PipelineReport> {
    const { contentDir, contentRoot, newRunId, now, reportsDir } = options;
    const pipelineDir = options.pipelineDir ?? dirname(reportsDir);
    const validate = options.validate ?? validateQuestion;
    const startedAt = now();
    // The manifest is untrusted: language ids, difficulty keys, and bank paths are joined
    // into file paths below, so nothing is read or written before it validates.
    const manifest = await loadValidatedManifest(contentDir);
    const questions: PipelineReportQuestion[] = [];
    for (const { bankKey, entry } of listBankEntries(manifest)) {
        const outRoot = resolveBankOutputRoot(pipelineDir, contentRoot, entry);
        const oracleSource = options.oracleSource ?? createOracleSource(join(outRoot, 'oracles'));
        // Paid banks are validated like free ones; only ids and verdicts leave this loop.
        for (const question of await readBankQuestions(resolveBankFile(contentDir, contentRoot, entry))) {
            const oracle = await oracleSource(bankKey, question.id);
            questions.push(toReportQuestion(question.id, bankKey, await validate(question, oracle)));
        }
    }
    const counts: Record<string, number> = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const { status } of questions) {
        counts[status] = (counts[status] ?? 0) + 1;
    }
    const report: PipelineReport = {
        counts,
        finishedAt: now(),
        questions,
        runId: newRunId(),
        stage: STAGE,
        startedAt,
    };
    await writePipelineReport(reportsDir, report);
    return report;
}
