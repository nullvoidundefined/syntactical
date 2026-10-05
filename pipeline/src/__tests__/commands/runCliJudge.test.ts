// The CLI builds the judge for gap-fill only, from the same --api flag as the provider.
import { describe, expect, it } from 'vitest';

import { type CliDeps, runCli } from '../../commands/runCli.js';

const JUDGE = { assertReady: async () => undefined, claude: {}, codex: {}, fetchSource: async () => ({}) };

function buildDeps() {
    const seen = { judges: [] as unknown[], kinds: [] as string[] };
    const deps = {
        buildManifest: async () => undefined,
        classify: async (options: { judge?: unknown }) => {
            seen.judges.push(options.judge);
            return {} as never;
        },
        contentDir: '/content',
        createJudge: (kind: 'api' | 'cli') => {
            seen.kinds.push(`judge:${kind}`);
            return JUDGE;
        },
        createProvider: (kind: 'api' | 'cli') => {
            seen.kinds.push(kind);
            return { generate: async () => ({ model: 'm', value: {} }) };
        },
        defaultContentRoot: '/default-root',
        env: {},
        gapFill: async (options: { judge?: unknown }) => {
            seen.judges.push(options.judge);
            return {} as never;
        },
        pipelineDir: '/pipeline/',
        stderr: () => undefined,
        stdout: () => undefined,
    } as unknown as CliDeps;
    return { deps, seen };
}

describe('runCli judge', () => {
    it('passes a cli judge to gap-fill', async () => {
        const { deps, seen } = buildDeps();
        expect(await runCli(['node', 'cli', 'gap-fill'], deps)).toBe(0);
        expect(seen.judges).toEqual([JUDGE]);
        expect(seen.judges[0]).toBe(JUDGE);
        expect(seen.kinds).toContain('judge:cli');
    });

    it('passes an api judge with --api', async () => {
        const { deps, seen } = buildDeps();
        expect(await runCli(['node', 'cli', 'gap-fill', '--api'], deps)).toBe(0);
        expect(seen.judges[0]).toBe(JUDGE);
        expect(seen.kinds).toContain('judge:api');
        expect(seen.kinds).not.toContain('judge:cli');
    });

    it('passes no judge to classify', async () => {
        const { deps, seen } = buildDeps();
        expect(await runCli(['node', 'cli', 'classify'], deps)).toBe(0);
        expect(seen.judges).toEqual([undefined]);
        expect(seen.kinds.filter((kind) => kind.startsWith('judge:'))).toEqual([]);
    });
});
