// With no text pre-filter in front of it, the Docker runner sandbox is the only control on
// drafted and generated code. For every place that handles such code, a hostile program
// reaches the injected runner exactly as `{ code, language, setupSql }` plus that site's
// fixed limits, and nothing else executes it: the default `runOracle` is replaced by a
// recorder that must stay silent.
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Provenance } from '@syntactical/content-schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { draftOracles } from '../../commands/draftOracles.js';
import { AB_BENCH } from '../../services/ab/AB_BENCH.js';
import { benchmarkAb } from '../../services/ab/benchmarkAb.js';
import { buildBenchOracle } from '../../services/ab/buildBenchOracle.js';
import { validateCorrectnessAb } from '../../services/ab/validateCorrectnessAb.js';
import { draftOracle } from '../../services/draftOracle.js';
import { GENERATE_RUN_LIMITS } from '../../services/gapFill/GENERATE_RUN_LIMITS.js';
import { generateQuestion } from '../../services/gapFill/generateQuestion.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { Oracle } from '../../types/Oracle.js';
import type { OracleLanguage } from '../../types/OracleLanguage.js';
import type { OracleRun } from '../../types/OracleRun.js';
import type { RunLimits } from '../../types/RunLimits.js';
import type { AbQuestion } from '../../types/ab/AbQuestion.js';

const defaultRunner = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock('../../clients/dockerRunner.js', () => ({
    runOracle: async (...args: unknown[]) => {
        defaultRunner.calls.push(args);
        return { exceptionType: 'RunnerFailure', outcome: 'exception' };
    },
}));

interface Hostile {
    contentLanguageId: string;
    oracle: Oracle;
}

const HOSTILE: [string, Hostile][] = [
    ['python', { contentLanguageId: 'python', oracle: { code: 'import subprocess; print(1)', language: 'python' } }],
    ['node', { contentLanguageId: 'javascript', oracle: { code: 'process.exit(0)', language: 'node' } }],
    [
        'postgres',
        {
            contentLanguageId: 'postgres',
            oracle: { code: "COPY t FROM PROGRAM 'id'", language: 'postgres', setupSql: "COPY t FROM PROGRAM 'id'" },
        },
    ],
];

const RUNNER_FAILURE: OracleRun = { exceptionType: 'RunnerFailure', outcome: 'exception' };
const HASH = '0123456789abcdef'.repeat(4);
const PROVENANCE: Provenance = {
    isHumanReviewed: false,
    source: 'original',
    validation: { method: 'executed', status: 'pending' },
};

interface RunCall {
    limits: RunLimits | undefined;
    oracle: Oracle;
}

function recordingRun(result: OracleRun = RUNNER_FAILURE) {
    const calls: RunCall[] = [];
    async function run(oracle: Oracle, limits?: RunLimits): Promise<OracleRun> {
        calls.push({ limits, oracle });
        return result;
    }
    return { calls, run };
}

// Answers each call with the reply for that call index, parsed by the request's schema.
function scripted(reply: (call: number) => unknown): ModelProvider {
    let call = 0;
    return {
        async generate(request) {
            const parsed = request.schema.safeParse(reply(call));
            call += 1;
            if (!parsed.success) {
                throw new ModelOutputInvalid(request.promptVersion, 'bad');
            }
            return { model: 'fake', value: parsed.data };
        },
    };
}

function sourceOf({ language, setupSql }: Oracle) {
    return { language, ...(setupSql === undefined ? {} : { setupSql }) };
}

function generateArgs(
    oracle: Oracle,
    languageId: string,
    provider: ModelProvider,
    run: ReturnType<typeof recordingRun>['run'],
) {
    return {
        difficulty: 'easy',
        existingPrompts: new Set<string>(),
        language: oracle.language,
        languageId,
        provider,
        run,
        topic: 'topic',
    };
}

function abQuestion(first: string, type: 'correctness' | 'performance'): AbQuestion {
    return {
        answerIndex: 0,
        choices: [
            { code: first, text: 'A' },
            { code: 'other()', text: 'B' },
        ],
        criterion: { evidence: 'pending', statement: 's', type },
        id: 'q-ab',
        prompt: 'Which?',
        provenance: PROVENANCE,
        query: { explanation: 'e', title: 't' },
        type: 'ab',
    };
}

async function writeBank(contentDir: string, languageId: string): Promise<void> {
    const files: Record<string, unknown> = {
        [`${languageId}/easy.json`]: { questions: [{ answer: true, id: 'q-1', prompt: 'p', type: 'bool' }] },
        'manifest.json': {
            languages: [
                {
                    banks: { easy: { access: 'free', contentVersion: 1, hash: HASH, path: `${languageId}/easy.json`, topicCounts: {} } },
                    glyph: 'G',
                    grammar: 'plain',
                    id: languageId,
                    label: 'L',
                    misconceptions: [],
                    tagline: 'T',
                    topics: [],
                },
            ],
            schemaVersion: 2,
        },
    };
    for (const [name, body] of Object.entries(files)) {
        await mkdir(dirname(join(contentDir, name)), { recursive: true });
        await writeFile(join(contentDir, name), JSON.stringify(body));
    }
}

afterEach(() => {
    expect(defaultRunner.calls).toEqual([]);
    defaultRunner.calls.length = 0;
});

describe.each(HOSTILE)('a hostile %s program', (_label, { contentLanguageId, oracle }) => {
    const { code, language, setupSql } = oracle;
    const draftReply = { code, isExecutable: true, ...(setupSql === undefined ? {} : { setupSql }) };

    it('draftOracle returns it unchanged and runs nothing', async () => {
        const question = { answer: true, id: 'q-1', prompt: 'p', provenance: PROVENANCE, query: { explanation: 'e', title: 't' }, type: 'bool' } as const;
        expect(await draftOracle(question, language, scripted(() => draftReply))).toEqual(oracle);
    });

    it('draftOracles saves it unchanged and runs nothing', async () => {
        const root = await mkdtemp(join(tmpdir(), 'run-path-'));
        const contentDir = join(root, 'content');
        const oraclesDir = join(root, 'oracles');
        await writeBank(contentDir, contentLanguageId);
        await draftOracles({ contentDir, log: () => undefined, oraclesDir, provider: scripted(() => draftReply) });
        const saved = JSON.parse(await readFile(join(oraclesDir, contentLanguageId, 'easy.json'), 'utf8'));
        expect(saved).toEqual({ 'q-1': oracle });
    });

    it("generateQuestion's execute request reaches the runner once, unchanged, with the fixed limits", async () => {
        const { calls, run } = recordingRun();
        const provider = scripted((call) => (call === 0 ? { execute: { code, language: contentLanguageId, ...(setupSql === undefined ? {} : { setupSql }) } } : {}));
        await generateQuestion(generateArgs(oracle, contentLanguageId, provider, run));
        expect(calls).toEqual([{ limits: GENERATE_RUN_LIMITS, oracle }]);
    });

    it("evaluateDraft's answer oracle reaches the runner only unchanged, with the fixed limits", async () => {
        const { calls, run } = recordingRun({ outcome: 'value', runtimeVersion: 'v', value: 'true' });
        const draft = {
            question: {
                answer: true,
                oracle: { code, ...(setupSql === undefined ? {} : { setupSql }) },
                prompt: 'Is it true?',
                query: { explanation: 'e', title: 't' },
                type: 'bool',
            },
        };
        const outcome = await generateQuestion(generateArgs(oracle, contentLanguageId, scripted(() => draft), run));
        expect(outcome.status).toBe('kept');
        // validateQuestion runs an oracle three times to reject a nondeterministic one.
        expect(calls).toEqual([1, 2, 3].map(() => ({ limits: GENERATE_RUN_LIMITS, oracle })));
    });

    it('benchmarkAb runs it once, inside the bench wrapper, with the bench limits', async () => {
        const { calls, run } = recordingRun();
        const source = sourceOf(oracle);
        const result = await benchmarkAb(abQuestion(code, 'performance'), source, run);
        expect(result).toMatchObject({ reason: 'runner-error' });
        expect(calls).toEqual([{ limits: { timeoutMs: AB_BENCH.timeoutMs }, oracle: buildBenchOracle(code, source) }]);
        // The option travels base64-encoded inside the wrapper (Postgres: inside the setup SQL).
        const { code: wrapped, setupSql: wrappedSetup = '' } = calls[0]?.oracle ?? { code: '' };
        expect(`${wrapped}\n${wrappedSetup}`).toContain(Buffer.from(code, 'utf8').toString('base64'));
    });

    it('validateCorrectnessAb runs it once as the option code plus the edge-case call', async () => {
        const { calls, run } = recordingRun();
        const edgeCases = [{ call: 'print(head())', expected: '1', input: '()' }];
        const result = await validateCorrectnessAb(abQuestion(code, 'correctness'), edgeCases, sourceOf(oracle), run);
        if (language === 'postgres') {
            expect(result).toMatchObject({ reason: 'unsupported-language' });
            expect(calls).toEqual([]);
            return;
        }
        const withCall = (snippet: string): RunCall => ({
            limits: undefined,
            oracle: { code: `${snippet}\nprint(head())`, language },
        });
        expect(calls).toEqual([withCall(code), withCall('other()')]);
    });
});

// Keeps the type import honest: every hostile row names a real oracle language.
const LANGUAGES: OracleLanguage[] = HOSTILE.map(([, { oracle }]) => oracle.language);
it('covers every oracle language', () => {
    expect([...LANGUAGES].sort()).toEqual(['node', 'postgres', 'python']);
});
