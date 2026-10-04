// `pipeline validate`: runs every question's oracle through `validateQuestion`
// and writes a pipeline report. It reads content files and never writes them.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Manifest, Question } from '@syntactical/content-schema';

import { validateQuestion } from '../services/validateQuestion.js';
import { writePipelineReport } from '../services/writePipelineReport.js';
import { resolveBankFile } from '../services/resolveBankFile.js';
import type { Oracle } from '../types/Oracle.js';
import type { OracleSource } from '../types/OracleSource.js';
import type { PipelineReport } from '../types/PipelineReport.js';
import type { PipelineReportQuestion } from '../types/PipelineReportQuestion.js';
import type { ValidationResult, ValidationStatus } from '../types/ValidationResult.js';

export type QuestionValidator = (question: Question, oracle: Oracle | null) => Promise<ValidationResult>;

export interface ValidateOptions {
    contentDir: string;
    // The private content repo that holds paid banks (B-60).
    contentRoot: string;
    reportsDir: string;
    oracleSource: OracleSource;
    newRunId: () => string;
    now: () => string;
    validate?: QuestionValidator;
}

const STAGE = 'validate';

const STATUSES: ValidationStatus[] = ['passed', 'failed', 'not-executable'];

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

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
    const { contentDir, contentRoot, newRunId, now, oracleSource, reportsDir } = options;
    const validate = options.validate ?? validateQuestion;
    const startedAt = now();
    const manifest = (await readJson(join(contentDir, 'manifest.json'))) as Manifest;
    const questions: PipelineReportQuestion[] = [];
    for (const language of manifest.languages) {
        const { banks, id: languageId } = language;
        for (const [difficulty, entry] of Object.entries(banks)) {
            const bankKey = `${languageId}/${difficulty}`;
            const bank = (await readJson(resolveBankFile(contentDir, contentRoot, entry))) as { questions: Question[] };
            // Paid banks are validated like free ones; only ids and verdicts leave this loop.
            for (const question of bank.questions) {
                const oracle = await oracleSource(bankKey, question.id);
                questions.push(toReportQuestion(question.id, bankKey, await validate(question, oracle)));
            }
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
