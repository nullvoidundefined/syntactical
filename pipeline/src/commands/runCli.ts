// The pipeline CLI's command dispatch, with every side effect injected so the real
// entry path can be tested: `validate`, `draft-oracles [--api]`, or
// `classify` or `gap-fill [--api] [--content-root <path>]`.
import { randomUUID } from 'node:crypto';

import { readContentRootFlag } from '../services/classify/readContentRootFlag.js';
import { createOracleSource } from '../services/createOracleSource.js';
import { exitCodeFor } from '../services/exitCodeFor.js';
import { pickProviderKind } from '../services/pickProviderKind.js';
import type { ModelProvider } from '../types/ModelProvider.js';

import type { classify } from './classify.js';
import type { draftOracles } from './draftOracles.js';
import type { gapFill } from './gapFill.js';
import type { validateContent } from './validate.js';

export interface CliDeps {
    classify: typeof classify;
    contentDir: string;
    defaultContentRoot: string;
    env: Record<string, string | undefined>;
    createProvider: (kind: 'api' | 'cli') => ModelProvider;
    draft: typeof draftOracles;
    gapFill: typeof gapFill;
    pipelineDir: string;
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

export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
    const { contentDir, createProvider, draft, pipelineDir, stderr, stdout, validate } = deps;
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
    if (command === 'classify' || command === 'gap-fill') {
        return runContentRootCommand(command, argv, deps);
    }
    if (command !== 'validate') {
        stderr('Usage: pipeline validate | draft-oracles [--api] | classify [--api] [--content-root <path>] | gap-fill [--api] [--content-root <path>]\n');
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
