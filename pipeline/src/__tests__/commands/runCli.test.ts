// The real CLI dispatch with its side effects replaced: provider selection by flag,
// and the usage path. No model, no Docker, no files.
import { describe, expect, it } from 'vitest';

import { type CliDeps, runCli } from '../../commands/runCli.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const PROVIDER = { generate: async () => ({ model: 'm', value: {} }) } as unknown as ModelProvider;

function buildDeps(
    env: Record<string, string | undefined> = {},
): CliDeps & { kinds: string[]; drafted: number; err: string[]; roots: string[] } {
    const deps = {
        classify: async (options: { contentRoot: string }) => {
            deps.roots.push(options.contentRoot);
            return {} as never;
        },
        contentDir: '/content',
        createProvider: (kind: 'api' | 'cli') => {
            deps.kinds.push(kind);
            return PROVIDER;
        },
        defaultContentRoot: '/default-root',
        draft: async () => {
            deps.drafted += 1;
        },
        drafted: 0,
        env,
        err: [] as string[],
        kinds: [] as string[],
        pipelineDir: '/pipeline/',
        roots: [] as string[],
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

    it('classify takes the content root from the flag, then the env var, then the default', async () => {
        const argv = ['node', 'cli.ts', 'classify'];
        const withFlag = buildDeps({ SYNTACTICAL_CONTENT_ROOT: '/env-root' });
        await runCli([...argv, '--content-root', '/flag-root'], withFlag);
        const withEquals = buildDeps();
        await runCli([...argv, '--content-root=/eq-root', '--api'], withEquals);
        const withEnv = buildDeps({ SYNTACTICAL_CONTENT_ROOT: '/env-root' });
        await runCli(argv, withEnv);
        const withDefault = buildDeps({ SYNTACTICAL_CONTENT_ROOT: '' });
        await runCli(argv, withDefault);
        expect([withFlag.roots, withEquals.roots, withEnv.roots, withDefault.roots]).toEqual([
            ['/flag-root'],
            ['/eq-root'],
            ['/env-root'],
            ['/default-root'],
        ]);
        expect(withEquals.kinds).toEqual(['api']);
    });

    it('classify with --content-root and no value exits 1 without classifying', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'classify', '--content-root'], deps)).toBe(1);
        expect(deps.err.join('')).toContain('--content-root needs a path');
        expect(deps.roots).toEqual([]);
        expect(deps.kinds).toEqual([]);
    });
});
