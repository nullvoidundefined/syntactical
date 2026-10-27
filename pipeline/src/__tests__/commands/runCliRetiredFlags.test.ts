// The two-repo content layout's flags are refused: a command line from before the import (one that names a private
// content root, or asks enrich for free banks only) exits 1 with a message saying why, before any provider is built
// or any stage runs, instead of silently running against content/.
import { describe, expect, it } from 'vitest';

import { type CliDeps, runCli } from '../../commands/runCli.js';
import type { ModelProvider } from '../../types/ModelProvider.js';

const PROVIDER = { generate: async () => ({ model: 'm', value: {} }) } as unknown as ModelProvider;
const CONTENT_ROOT_MESSAGE = '--content-root is not supported: every bank is under content/\n';
const FREE_ONLY_MESSAGE = '--free-only is not supported: every bank is free\n';
const COMMANDS = [
    'classify',
    'gap-fill',
    'enrich',
    'review',
    'publish',
    'rewrite-prompts',
    'validate',
    'apply-staging',
    'write-references',
    'draft-oracles',
];

function buildDeps(): CliDeps & { calls: string[]; err: string[]; kinds: string[] } {
    const deps = {
        applyStaging: async () => {
            deps.calls.push('apply-staging');
            return { rationales: 0, references: 0 };
        },
        buildManifest: async () => undefined,
        calls: [] as string[],
        classify: async () => {
            deps.calls.push('classify');
            return {} as never;
        },
        contentDir: '/content',
        createProvider: (kind: 'api' | 'cli') => {
            deps.kinds.push(kind);
            return PROVIDER;
        },
        createSourceFetcher: () => async () => ({ ok: false as const, reason: 'network' as const }),
        draft: async () => {
            deps.calls.push('draft-oracles');
        },
        draftTaxonomy: async () => {
            deps.calls.push('draft-taxonomy');
            return '/x';
        },
        enrich: async () => {
            deps.calls.push('enrich');
            return {} as never;
        },
        env: {},
        err: [] as string[],
        gapFill: async () => {
            deps.calls.push('gap-fill');
            return {} as never;
        },
        kinds: [] as string[],
        pipelineDir: '/pipeline/',
        publish: async () => {
            deps.calls.push('publish');
            return { banks: {} } as never;
        },
        review: async () => {
            deps.calls.push('review');
            return { approved: 0, items: 0, pending: 0, problems: 0, rejected: 0 };
        },
        rewritePrompts: async () => {
            deps.calls.push('rewrite-prompts');
        },
        stderr: (text: string) => {
            deps.err.push(text);
        },
        stdout: () => undefined,
        validate: async () => {
            deps.calls.push('validate');
            return { counts: {} } as never;
        },
        verifyDocLinks: async () => {
            deps.calls.push('verify-doc-links');
            return { failed: 0, passed: 0 };
        },
        writeReferences: async () => {
            deps.calls.push('write-references');
            return { accepted: 0, revealedAnswer: 0, skipped: 0 };
        },
    };
    return deps;
}

describe('runCli retired content flags', () => {
    it.each<[string, string[]]>(
        COMMANDS.flatMap((command): [string, string[]][] => [
            [command, ['--content-root', '/private']],
            [command, ['--content-root=/private']],
        ]),
    )('%s %j exits 1 naming --content-root before running anything', async (command, flags) => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', command, ...flags], deps)).toBe(1);
        expect(deps.err.join('')).toBe(CONTENT_ROOT_MESSAGE);
        expect(deps.calls).toEqual([]);
        expect(deps.kinds).toEqual([]);
    });

    it('enrich --free-only exits 1 naming --free-only before running anything', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'enrich', '--free-only', '--language', 'python'], deps)).toBe(1);
        expect(deps.err.join('')).toBe(FREE_ONLY_MESSAGE);
        expect(deps.calls).toEqual([]);
        expect(deps.kinds).toEqual([]);
    });

    it('runs a command with neither flag as before', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'classify', '--api'], deps)).toBe(0);
        expect(deps.calls).toEqual(['classify']);
        expect(deps.err).toEqual([]);
    });

    it('names neither flag in the usage text', async () => {
        const deps = buildDeps();
        expect(await runCli(['node', 'cli.ts', 'nope'], deps)).toBe(1);
        expect(deps.err.join('')).not.toContain('--content-root');
        expect(deps.err.join('')).not.toContain('--free-only');
    });
});
