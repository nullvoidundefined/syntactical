// The real CLI dispatch with its side effects replaced: provider selection by flag,
// and the usage path. No model, no Docker, no files.
import { describe, expect, it } from 'vitest';

import { type CliDeps, runCli } from '../../commands/runCli.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const PROVIDER = { generate: async () => ({ model: 'm', value: {} }) } as unknown as ModelProvider;

function buildDeps(
    env: Record<string, string | undefined> = {},
): CliDeps & {
    kinds: string[];
    drafted: number;
    reviewProblems: number;
    err: string[];
    gapRoots: string[];
    languages: string[];
    publishedBanks: Record<string, { isWritten: boolean }>;
    roots: string[];
} {
    const deps = {
        buildManifest: async () => undefined,
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
        gapFill: async (options: { contentRoot: string }) => {
            deps.gapRoots.push(options.contentRoot);
            return {} as never;
        },
        gapRoots: [] as string[],
        drafted: 0,
        draftTaxonomy: async (options: { language: string }) => {
            deps.languages.push(options.language);
            return '/x';
        },
        languages: [] as string[],
        enrich: async (options: { contentRoot: string }) => {
            deps.roots.push(options.contentRoot);
            return {} as never;
        },
        env,
        err: [] as string[],
        kinds: [] as string[],
        pipelineDir: '/pipeline/',
        publish: async (options: { contentRoot: string }) => {
            deps.roots.push(options.contentRoot);
            return { banks: deps.publishedBanks } as never;
        },
        publishedBanks: {} as Record<string, { isWritten: boolean }>,
        review: async (options: { contentRoot: string }) => {
            deps.roots.push(options.contentRoot);
            return { approved: 0, items: 0, pending: 0, problems: deps.reviewProblems, rejected: 0 };
        },
        reviewProblems: 0,
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

    it('draft-taxonomy passes the language through and builds the provider the flag names', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'draft-taxonomy', 'python', '--api'], deps)).toBe(0);
        expect(deps.languages).toEqual(['python']);
        expect(deps.kinds).toEqual(['api']);
    });

    it('draft-taxonomy with no language exits 1 without building a provider', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'draft-taxonomy', '--api'], deps)).toBe(1);
        expect(deps.err.join('')).toContain('needs a language');
        expect(deps.kinds).toEqual([]);
    });

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

    it('enrich runs the enrich stage with the content root and the provider the flags name', async () => {
        const withFlag = buildDeps({ SYNTACTICAL_CONTENT_ROOT: '/env-root' });
        expect(await runCli(['node', 'cli.ts', 'enrich', '--api', '--content-root', '/flag-root'], withFlag)).toBe(0);
        const withEnv = buildDeps({ SYNTACTICAL_CONTENT_ROOT: '/env-root' });
        await runCli(['node', 'cli.ts', 'enrich'], withEnv);
        expect([withFlag.roots, withEnv.roots]).toEqual([['/flag-root'], ['/env-root']]);
        expect([withFlag.kinds, withEnv.kinds]).toEqual([['api'], ['cli']]);
    });

    it('enrich with --content-root and no value exits 1 without enriching', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'enrich', '--content-root'], deps)).toBe(1);
        expect(deps.roots).toEqual([]);
        expect(deps.kinds).toEqual([]);
    });

    it('gap-fill uses the --api provider and the content root flag, then env, then default', async () => {
        const argv = ['node', 'cli.ts', 'gap-fill'];
        const withFlag = buildDeps({ SYNTACTICAL_CONTENT_ROOT: '/env-root' });
        await runCli([...argv, '--api', '--content-root', '/flag-root'], withFlag);
        const withEnv = buildDeps({ SYNTACTICAL_CONTENT_ROOT: '/env-root' });
        await runCli(argv, withEnv);
        const withDefault = buildDeps();
        await runCli(argv, withDefault);
        expect([withFlag.gapRoots, withEnv.gapRoots, withDefault.gapRoots]).toEqual([
            ['/flag-root'],
            ['/env-root'],
            ['/default-root'],
        ]);
        expect(withFlag.kinds).toEqual(['api']);
        expect(withFlag.roots).toEqual([]);
    });

    it('review resolves the content root like classify, builds no provider, and exits 1 on file problems', async () => {
        const argv = ['node', 'cli.ts', 'review'];
        const clean = buildDeps({ SYNTACTICAL_CONTENT_ROOT: '/env-root' });
        expect(await runCli([...argv, '--content-root', '/flag-root'], clean)).toBe(0);
        const fromEnv = buildDeps({ SYNTACTICAL_CONTENT_ROOT: '/env-root' });
        await runCli(argv, fromEnv);
        const broken = buildDeps();
        broken.reviewProblems = 2;
        expect(await runCli(argv, broken)).toBe(1);
        expect([clean.roots, fromEnv.roots, broken.roots]).toEqual([['/flag-root'], ['/env-root'], ['/default-root']]);
        expect(clean.kinds).toEqual([]);
    });

    it('publish runs with the content root and exits 1 when any bank was refused', async () => {
        const clean = buildDeps();
        clean.publishedBanks = { 'python/easy': { isWritten: true } };
        expect(await runCli(['node', 'cli.ts', 'publish', '--content-root', '/flag-root'], clean)).toBe(0);
        const refused = buildDeps();
        refused.publishedBanks = { 'python/easy': { isWritten: true }, 'python/hard': { isWritten: false } };
        expect(await runCli(['node', 'cli.ts', 'publish'], refused)).toBe(1);
        expect([clean.roots, refused.roots]).toEqual([['/flag-root'], ['/default-root']]);
        expect(refused.err.join('')).toContain('bank refused: python/hard');
        expect(clean.kinds).toEqual([]);
    });
});
