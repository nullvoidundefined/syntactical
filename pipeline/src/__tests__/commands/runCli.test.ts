// The real CLI dispatch with its side effects replaced: provider selection by flag,
// and the usage path. No model, no Docker, no files.
import { describe, expect, it } from 'vitest';

import { type CliDeps, runCli } from '../../commands/runCli.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const PROVIDER = { generate: async () => ({ model: 'm', value: {} }) } as unknown as ModelProvider;

function buildDeps(): CliDeps & { kinds: string[]; drafted: number; err: string[] } {
    const deps = {
        contentDir: '/content',
        createProvider: (kind: 'api' | 'cli') => {
            deps.kinds.push(kind);
            return PROVIDER;
        },
        draft: async () => {
            deps.drafted += 1;
        },
        drafted: 0,
        err: [] as string[],
        kinds: [] as string[],
        pipelineDir: '/pipeline/',
        stderr: (text: string) => {
            deps.err.push(text);
        },
        stdout: () => undefined,
        validate: async () => {
            throw new Error('validate must not run');
        },
    };
    return deps;
}

describe('runCli', () => {
    it('draft-oracles --api builds the API provider', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'draft-oracles', '--api'], deps)).toBe(0);
        expect(deps.kinds).toEqual(['api']);
        expect(deps.drafted).toBe(1);
    });

    it.each([[['node', 'cli.ts', 'draft-oracles']], [['node', 'cli.ts', 'draft-oracles', '--API']]])(
        'draft-oracles without --api builds the CLI provider: %j',
        async (argv) => {
            const deps = buildDeps();
            await runCli(argv, deps);
            expect(deps.kinds).toEqual(['cli']);
        },
    );

    it('prints usage and exits 1 for an unknown command, without building a provider', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'nope'], deps)).toBe(1);
        expect(deps.err.join('')).toContain('Usage: pipeline');
        expect(deps.kinds).toEqual([]);
    });
});
