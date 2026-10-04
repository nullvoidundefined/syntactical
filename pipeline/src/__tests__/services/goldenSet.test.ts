// B-9: the validator classifies every question in the golden set correctly.
// Each language's golden file (pipeline/golden/<language>.json) holds at least
// 10 questions, at least half of them deliberately wrong, each with its oracle,
// the run the real runner produces for that oracle (`fakeRun`), and the
// expected result: known-correct questions pass, deliberately wrong ones fail
// with `answer-mismatch`.
//
// The first block replays each entry's recorded run through `validateQuestion`
// (no Docker). The second runs the same entries against the real runners and
// must reach the same expectations; set SKIP_DOCKER_TESTS=1 to skip it where
// Docker is unavailable.
import { readFileSync } from 'node:fs';

import type { Question } from '@syntactical/content-schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ensureRunnerImage } from '../../clients/ensureRunnerImage.js';
import { validateQuestion } from '../../services/validateQuestion.js';
import type { Oracle } from '../../types/Oracle.js';
import type { OracleLanguage } from '../../types/OracleLanguage.js';
import type { OracleRun } from '../../types/OracleRun.js';
import type { ValidationResult } from '../../types/ValidationResult.js';
import {
    acquireDockerTestLock,
    DOCKER_LOCK_WAIT_MS,
    releaseDockerTestLock,
} from '../fixtures/dockerTestLock.js';

const SKIP_DOCKER = process.env.SKIP_DOCKER_TESTS === '1';

const LANGUAGES: OracleLanguage[] = ['python', 'node', 'postgres', 'ruby', 'rails', 'go'];

const MIN_ENTRIES = 10;

const ENTRY_TIMEOUT_MS = 120_000;

type GoldenEntry = {
    id: string;
    note: string;
    question: Question;
    oracle: Oracle;
    fakeRun: OracleRun;
    expected: { status: ValidationResult['status']; reason?: ValidationResult['reason'] };
};

function loadGolden(language: OracleLanguage): GoldenEntry[] {
    const url = new URL(`../../../golden/${language}.json`, import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')) as GoldenEntry[];
}

function isDeliberatelyWrong(entry: GoldenEntry): boolean {
    return entry.expected.status === 'failed' && entry.expected.reason === 'answer-mismatch';
}

function replay(run: OracleRun): (oracle: Oracle) => Promise<OracleRun> {
    return async () => run;
}

describe('golden set', () => {
    describe.each(LANGUAGES)('%s golden file', (language) => {
        const entries = loadGolden(language);

        it(`holds at least ${MIN_ENTRIES} questions, at least half deliberately wrong, the rest correct`, () => {
            expect(entries.length).toBeGreaterThanOrEqual(MIN_ENTRIES);
            const wrong = entries.filter(isDeliberatelyWrong);
            const correct = entries.filter((entry) => entry.expected.status === 'passed');
            expect(wrong.length * 2).toBeGreaterThanOrEqual(entries.length);
            expect(correct.length).toBeGreaterThan(0);
            expect(wrong.length + correct.length).toBe(entries.length);
        });

        it('has unique ids and oracles in its own language', () => {
            const ids = entries.map((entry) => entry.id);
            expect(new Set(ids).size).toBe(ids.length);
            for (const entry of entries) {
                expect(entry.oracle.language, entry.id).toBe(language);
                expect(entry.question.id, entry.id).toBe(entry.id);
            }
        });

        it.each(entries.map((entry) => [entry.id, entry] as const))(
            'classifies %s from its recorded run',
            async (_id, entry) => {
                const result = await validateQuestion(entry.question, entry.oracle, replay(entry.fakeRun));

                expect({ status: result.status, reason: result.reason }).toStrictEqual({
                    status: entry.expected.status,
                    reason: entry.expected.reason,
                });
                if (entry.expected.status === 'passed') {
                    expect(result.runtimeVersion).toBe(entry.fakeRun.runtimeVersion);
                }
            },
        );
    });
});

describe.skipIf(SKIP_DOCKER)('golden set (docker)', () => {
    beforeAll(async () => {
        await acquireDockerTestLock();
        for (const language of LANGUAGES) {
            await ensureRunnerImage(language);
        }
    }, DOCKER_LOCK_WAIT_MS + 600_000);

    afterAll(() => {
        releaseDockerTestLock();
    });

    describe.each(LANGUAGES)('%s against the real runner', (language) => {
        const entries = loadGolden(language);

        it.each(entries.map((entry) => [entry.id, entry] as const))(
            'classifies %s the same as its recorded run',
            async (_id, entry) => {
                const result = await validateQuestion(entry.question, entry.oracle);

                expect({ status: result.status, reason: result.reason }).toStrictEqual({
                    status: entry.expected.status,
                    reason: entry.expected.reason,
                });
            },
            ENTRY_TIMEOUT_MS,
        );
    });
});
