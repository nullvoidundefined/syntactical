// The pipeline CLI's command dispatch, with every side effect injected so the real
// entry path can be tested: `validate [--content-root <path>]`, `draft-oracles [--api]`, or
// `classify`, `gap-fill`, or `enrich [--api] [--content-root <path>]`, `review [--content-root <path>]`, or `publish [--content-root <path>]`.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { readContentRootFlag } from '../services/classify/readContentRootFlag.js';
import { exitCodeFor } from '../services/exitCodeFor.js';
import { pickProviderKind } from '../services/pickProviderKind.js';
import type { GapFillJudge } from '../types/judge/GapFillJudge.js';
import type { ModelProvider } from '../types/ModelProvider.js';

import type { classify } from './classify.js';
import type { draftOracles } from './draftOracles.js';
import type { draftTaxonomy } from './draftTaxonomy.js';
import type { enrich } from './enrich.js';
import type { gapFill } from './gapFill.js';
import type { publish } from './publish.js';
import type { review } from './review.js';
import type { validateContent } from './validate.js';

export interface CliDeps {
    createJudge?: (kind: 'api' | 'cli') => GapFillJudge;
    buildManifest: (contentRoot: string) => Promise<void>;
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
    publish: typeof publish;
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
    const kind = pickProviderKind(argv);
    const shared = {
        contentDir,
        contentRoot,
        log: (line: string) => stdout(`${line}\n`),
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        pipelineDir,
        provider: createProvider(kind),
    };
    if (command === 'gap-fill')
        await runGapFill({ ...shared, ...(deps.createJudge ? { judge: deps.createJudge(kind) } : {}) });
    else await runClassify(shared);
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
    const result = await run({
        contentDir,
        contentRoot: flagRoot ?? (env.SYNTACTICAL_CONTENT_ROOT || defaultContentRoot),
        log: (line) => stdout(`${line}\n`),
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
        pipelineDir,
        provider: createProvider(pickProviderKind(argv)),
    });
    return 0;
}

async function runPublish(argv: string[], deps: CliDeps): Promise<number> {
    const { buildManifest, contentDir, pipelineDir, publish: run, stderr, stdout } = deps;
    const contentRoot = resolveContentRoot(argv, deps);
    if (contentRoot === undefined) {
        return 1;
    }
    const { banks } = await run({
        buildManifest,
        contentDir,
        contentRoot,
        log: (line) => stdout(`${line}\n`),
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        pipelineDir,
    });
    const refusedBanks = Object.entries(banks).filter(([, { isWritten }]) => !isWritten);
    for (const [bankKey] of refusedBanks) {
        stderr(`bank refused: ${bankKey}\n`);
    }
    return refusedBanks.length === 0 ? 0 : 1;
}

export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
    const {
        contentDir,
        createProvider,
        draft,
        draftTaxonomy: draftTaxonomyList,
        pipelineDir,
        stderr,
        stdout,
        validate,
    } = deps;
    const [command] = argv.slice(FIRST_COMMAND_ARG);
    if (command === 'draft-oracles') {
        await draft({
            contentDir,
            log: (line) => stdout(`${line}\n`),
            oraclesDir: join(pipelineDir, 'oracles'),
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
    if (command === 'publish') {
        return runPublish(argv, deps);
    }
    if (command !== 'validate') {
        stderr(
            'Usage: pipeline validate [--content-root <path>] | draft-oracles [--api] | draft-taxonomy <language> [--api] | classify [--api] [--content-root <path>] | gap-fill [--api] [--content-root <path>] | enrich [--api] [--content-root <path>] | review [--content-root <path>] | publish [--content-root <path>]\n',
        );
        return 1;
    }
    const contentRoot = resolveContentRoot(argv, deps);
    if (contentRoot === undefined) {
        return 1;
    }
    const report = await validate({
        contentDir,
        contentRoot,
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        pipelineDir,
        reportsDir: join(pipelineDir, 'reports'),
    });
    stdout(`${JSON.stringify(report.counts)}\n`);
    return exitCodeFor(report.counts);
}
