// The pipeline CLI's command dispatch, with every side effect injected so the real
// entry path can be tested: `validate`, `draft-oracles [--api]`, or
// `classify`, `gap-fill`, or `enrich [--api] [--content-root <path>]`, or `review [--content-root <path>]`.
import { randomUUID } from 'node:crypto';

import { readContentRootFlag } from '../services/classify/readContentRootFlag.js';
import { createOracleSource } from '../services/createOracleSource.js';
import { exitCodeFor } from '../services/exitCodeFor.js';
import { pickProviderKind } from '../services/pickProviderKind.js';
import { validateQuestion } from '../services/validateQuestion.js';
import type { ModelProvider } from '../types/ModelProvider.js';

import type { classify } from './classify.js';
import type { draftOracles } from './draftOracles.js';
import type { draftTaxonomy } from './draftTaxonomy.js';
import type { enrich } from './enrich.js';
import type { gapFill } from './gapFill.js';
import type { review } from './review.js';
import type { validateContent } from './validate.js';

export interface CliDeps {
    classify: typeof classify;
    contentDir: string;
    defaultContentRoot: string;
    env: Record<string, string | undefined>;
    createProvider: (kind: 'api' | 'cli') => ModelProvider;
    draft: typeof draftOracles;
    gapFill: typeof gapFill;
    draftTaxonomy: typeof draftTaxonomy;
    enrich: typeof enrich;
    pipelineDir: string;
    review: typeof review;
    stderr: (text: string) => void;
    stdout: (text: string) => void;
    validate: typeof validateContent;
}

const FIRST_COMMAND_ARG = 2;

// The content root: `--content-root` beats `SYNTACTICAL_CONTENT_ROOT`, which beats the default.
// A bad flag is reported on stderr and returns undefined.
function resolveContentRoot(argv: string[], deps: CliDeps): string | undefined {
    const { defaultContentRoot, env, stderr } = deps;
    try {
        return readContentRootFlag(argv) ?? (env.SYNTACTICAL_CONTENT_ROOT || defaultContentRoot);
    } catch (error) {
        stderr(`${(error as Error).message}\n`);
        return undefined;
    }
}

async function runContentRootCommand(command: 'classify' | 'gap-fill', argv: string[], deps: CliDeps): Promise<number> {
    const { classify: runClassify, contentDir, createProvider, gapFill: runGapFill, pipelineDir, stdout } = deps;
    const contentRoot = resolveContentRoot(argv, deps);
    if (contentRoot === undefined) {
        return 1;
    }
    const run = command === 'classify' ? runClassify : runGapFill;
    await run({
        contentDir,
        contentRoot,
        log: (line) => stdout(`${line}\n`),
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        pipelineDir,
        provider: createProvider(pickProviderKind(argv)),
    });
    return 0;
}

// `review` needs no model: it shows each item's oracle output, re-run through the sandbox.
async function runReview(argv: string[], deps: CliDeps): Promise<number> {
    const { contentDir, defaultContentRoot, env, pipelineDir, review: run, stderr, stdout } = deps;
    let flagRoot: string | undefined;
    try {
        flagRoot = readContentRootFlag(argv);
    } catch (error) {
        stderr(`${(error as Error).message}\n`);
        return 1;
    }
    const oracleSource = createOracleSource(`${pipelineDir}oracles`);
    const result = await run({
        contentDir,
        contentRoot: flagRoot ?? (env.SYNTACTICAL_CONTENT_ROOT || defaultContentRoot),
        log: (line) => stdout(`${line}\n`),
        observe: async (bankKey, question) =>
            (await validateQuestion(question, await oracleSource(bankKey, question.id))).observed,
        pipelineDir,
    });
    return result.problems > 0 ? 1 : 0;
}

async function runEnrich(argv: string[], deps: CliDeps): Promise<number> {
    const { contentDir, createProvider, enrich: run, pipelineDir, stdout } = deps;
    const contentRoot = resolveContentRoot(argv, deps);
    if (contentRoot === undefined) {
        return 1;
    }
    await run({
        contentDir,
        contentRoot,
        log: (line) => stdout(`${line}\n`),
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        oracleSource: createOracleSource(`${pipelineDir}oracles`),
        pipelineDir,
        provider: createProvider(pickProviderKind(argv)),
    });
    return 0;
}

export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
    const { contentDir, createProvider, draft, draftTaxonomy: draftTaxonomyList, pipelineDir, stderr, stdout, validate } =
        deps;
    const [command] = argv.slice(FIRST_COMMAND_ARG);
    if (command === 'draft-oracles') {
        await draft({
            contentDir,
            log: (line) => stdout(`${line}\n`),
            oraclesDir: `${pipelineDir}oracles`,
            provider: createProvider(pickProviderKind(argv)),
        });
        return 0;
    }
    if (command === 'draft-taxonomy') {
        const [language] = argv.slice(FIRST_COMMAND_ARG + 1).filter((arg) => !arg.startsWith('--'));
        if (language === undefined) {
            stderr('draft-taxonomy needs a language\n');
            return 1;
        }
        await draftTaxonomyList({
            contentDir,
            language,
            log: (line) => stdout(`${line}\n`),
            pipelineDir,
            provider: createProvider(pickProviderKind(argv)),
        });
        return 0;
    }
    if (command === 'classify' || command === 'gap-fill') {
        return runContentRootCommand(command, argv, deps);
    }
    if (command === 'enrich') {
        return runEnrich(argv, deps);
    }
    if (command === 'review') {
        return runReview(argv, deps);
    }
    if (command !== 'validate') {
        stderr(
            'Usage: pipeline validate | draft-oracles [--api] | draft-taxonomy <language> [--api] | classify [--api] [--content-root <path>] | gap-fill [--api] [--content-root <path>] | enrich [--api] [--content-root <path>] | review [--content-root <path>]\n',
        );
        return 1;
    }
    const report = await validate({
        contentDir,
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        oracleSource: createOracleSource(`${pipelineDir}oracles`),
        reportsDir: `${pipelineDir}reports`,
    });
    stdout(`${JSON.stringify(report.counts)}\n`);
    return exitCodeFor(report.counts);
}
