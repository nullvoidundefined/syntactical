// The pipeline CLI's command dispatch, with every side effect injected so the real
// entry path can be tested: `validate` or `draft-oracles [--api]`.
import { randomUUID } from 'node:crypto';

import { createOracleSource } from '../services/createOracleSource.js';
import { exitCodeFor } from '../services/exitCodeFor.js';
import { pickProviderKind } from '../services/pickProviderKind.js';
import type { ModelProvider } from '../types/ModelProvider.js';
import type { draftOracles } from './draftOracles.js';
import type { validateContent } from './validate.js';

export interface CliDeps {
    contentDir: string;
    createProvider: (kind: 'api' | 'cli') => ModelProvider;
    draft: typeof draftOracles;
    pipelineDir: string;
    stderr: (text: string) => void;
    stdout: (text: string) => void;
    validate: typeof validateContent;
}

const FIRST_COMMAND_ARG = 2;

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
    if (command !== 'validate') {
        stderr('Usage: pipeline validate | draft-oracles [--api]\n');
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
