// The real CLI dispatch with its side effects replaced: provider selection by flag,
// and the usage path. No model, no Docker, no files.
import { describe, expect, it } from 'vitest';

import { type CliDeps, runCli } from '../../commands/runCli.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const PROVIDER = { generate: async () => ({ model: 'm', value: {} }) } as unknown as ModelProvider;

function buildDeps(env: Record<string, string | undefined> = {}): CliDeps & {
    kinds: string[];
    drafted: number;
    reviewProblems: number;
    err: string[];
    builds: number;
    languages: string[];
    publishedBanks: Record<string, { isWritten: boolean }>;
    models: (string | undefined)[];
    calls: Record<string, unknown>[];
} {
    const deps = {
        applyStaging: async (options: { buildManifest: () => Promise<void> }) => {
            await options.buildManifest();
            deps.calls.push({ command: 'apply-staging' });
            return { rationales: 0, references: 0 };
        },
        buildManifest: async () => {
            deps.builds += 1;
        },
        builds: 0,
        calls: [] as Record<string, unknown>[],
        classify: async () => {
            deps.calls.push({ command: 'classify' });
            return {} as never;
        },
        contentDir: '/content',
        createProvider: (kind: 'api' | 'cli', model?: string) => {
            deps.kinds.push(kind);
            deps.models.push(model);
            return PROVIDER;
        },
        createSourceFetcher: () => async () => ({ ok: false as const, reason: 'network' as const }),
        draft: async () => {
            deps.drafted += 1;
        },
        gapFill: async () => {
            deps.calls.push({ command: 'gap-fill' });
            return {} as never;
        },
        drafted: 0,
        draftTaxonomy: async (options: { language: string }) => {
            deps.languages.push(options.language);
            return '/x';
        },
        languages: [] as string[],
        enrich: async (options: { languages?: readonly string[]; secondProvider?: ModelProvider }) => {
            deps.calls.push({
                command: 'enrich',
                hasSecondProvider: options.secondProvider !== undefined,
                ...(options.languages === undefined ? {} : { languages: options.languages }),
            });
            return {} as never;
        },
        env,
        err: [] as string[],
        kinds: [] as string[],
        models: [] as (string | undefined)[],
        pipelineDir: '/pipeline/',
        publish: async () => {
            deps.calls.push({ command: 'publish' });
            return { banks: deps.publishedBanks } as never;
        },
        publishedBanks: {} as Record<string, { isWritten: boolean }>,
        review: async () => {
            deps.calls.push({ command: 'review' });
            return { approved: 0, items: 0, pending: 0, problems: deps.reviewProblems, rejected: 0 };
        },
        reviewProblems: 0,
        rewritePrompts: async () => undefined,
        stderr: (text: string) => {
            deps.err.push(text);
        },
        stdout: () => undefined,
        validate: async () => {
            throw new Error('validate must not run');
        },
        verifyDocLinks: async (options: { recheck?: boolean }) => {
            deps.calls.push({ command: 'verify-doc-links', recheck: options.recheck });
            return { failed: 0, passed: 1 };
        },
        writeReferences: async (options: { languages?: readonly string[] }) => {
            deps.calls.push({ command: 'write-references', languages: options.languages });
            return { accepted: 0, revealedAnswer: 0, skipped: 0 };
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
        expect(deps.err.join('')).toContain('rewrite-prompts [--api] | review | publish');
        expect(deps.kinds).toEqual([]);
    });

    it('rewrite-prompts builds the CLI provider by default and the API provider with --api', async () => {
        const withDefault = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'rewrite-prompts'], withDefault)).toBe(0);
        expect(withDefault.kinds).toEqual(['cli']);
        const withApi = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'rewrite-prompts', '--api'], withApi)).toBe(0);
        expect(withApi.kinds).toEqual(['api']);
    });

    it('classify and gap-fill run with the provider the flag names', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'classify', '--api'], deps)).toBe(0);
        expect(await runCli(['node', 'cli.ts', 'gap-fill'], deps)).toBe(0);
        expect(deps.calls).toEqual([{ command: 'classify' }, { command: 'gap-fill' }]);
        expect(deps.kinds).toEqual(['api', 'cli']);
    });

    it('enrich runs the enrich stage with the provider the flag names', async () => {
        const withApi = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'enrich', '--api'], withApi)).toBe(0);
        const plain = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'enrich'], plain)).toBe(0);
        expect([withApi.kinds, plain.kinds]).toEqual([['api'], ['cli']]);
    });

    it('review builds no provider and exits 1 on file problems', async () => {
        const argv = ['node', 'cli.ts', 'review'];
        const clean = buildDeps();
        expect(await runCli(argv, clean)).toBe(0);
        const broken = buildDeps();
        broken.reviewProblems = 2;
        expect(await runCli(argv, broken)).toBe(1);
        expect(clean.kinds).toEqual([]);
    });

    it('publish exits 1 when any bank was refused', async () => {
        const clean = buildDeps();
        clean.publishedBanks = { 'python/easy': { isWritten: true } };
        expect(await runCli(['node', 'cli.ts', 'publish'], clean)).toBe(0);
        const refused = buildDeps();
        refused.publishedBanks = { 'python/easy': { isWritten: true }, 'python/hard': { isWritten: false } };
        expect(await runCli(['node', 'cli.ts', 'publish'], refused)).toBe(1);
        expect(refused.err.join('')).toContain('bank refused: python/hard');
        expect(clean.kinds).toEqual([]);
    });

    it('enrich builds a second judge on the second model only with --judge-without-oracle', async () => {
        const plain = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'enrich'], plain)).toBe(0);
        expect(plain.calls).toEqual([{ command: 'enrich', hasSecondProvider: false }]);
        const judged = buildDeps({ PIPELINE_SECOND_MODEL: 'claude-sonnet-5-5' });
        expect(await runCli(['node', 'cli.ts', 'enrich', '--judge-without-oracle'], judged)).toBe(0);
        expect(judged.calls).toEqual([{ command: 'enrich', hasSecondProvider: true }]);
        expect(judged.models).toEqual([undefined, 'claude-sonnet-5-5']);
    });

    it('write-references passes the --language list and builds a default second model', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'write-references', '--language', 'python,postgres'], deps)).toBe(0);
        expect(deps.calls).toEqual([{ command: 'write-references', languages: ['python', 'postgres'] }]);
        expect(deps.models).toEqual([undefined, 'claude-haiku-5-5']);
    });

    it('write-references refuses an empty --language list', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'write-references', '--language'], deps)).toBe(1);
        expect(deps.calls).toEqual([]);
    });

    it('verify-doc-links passes --recheck and builds no model', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'verify-doc-links', '--recheck'], deps)).toBe(0);
        expect(deps.calls).toEqual([{ command: 'verify-doc-links', recheck: true }]);
        expect(deps.kinds).toEqual([]);
    });

    it('apply-staging rebuilds the manifest once and builds no provider', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'apply-staging'], deps)).toBe(0);
        expect(deps.calls).toEqual([{ command: 'apply-staging' }]);
        expect(deps.builds).toBe(1);
        expect(deps.kinds).toEqual([]);
    });

    it('enrich passes the --language list, and refuses an empty list', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'enrich', '--language', 'python,postgres'], deps)).toBe(0);
        expect(deps.calls).toEqual([
            { command: 'enrich', hasSecondProvider: false, languages: ['python', 'postgres'] },
        ]);
        const empty = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'enrich', '--language'], empty)).toBe(1);
        expect(empty.calls).toEqual([]);
    });
});
