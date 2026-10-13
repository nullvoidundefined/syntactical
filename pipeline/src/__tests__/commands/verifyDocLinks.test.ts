// `pipeline verify-doc-links` with a scripted fetcher (no network): every staged link is checked
// with its track's hosts and recorded; a passed link is not fetched again, a failed one is.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SourceFetcher } from '../../clients/sourceFetcher.js';
import { verifyDocLinks } from '../../commands/verifyDocLinks.js';
import { writeJsonAtomic } from '../../services/classify/writeJsonAtomic.js';

const GOOD = 'https://docs.python.org/3/library/stdtypes.html';
const BROKEN = 'https://docs.python.org/3/made-up.html';

describe('verifyDocLinks', () => {
    let pipelineDir: string;

    beforeEach(async () => {
        pipelineDir = await mkdtemp(join(tmpdir(), 'doc-links-'));
        const docs = [
            { title: 'Types', url: GOOD },
            { title: 'Missing', url: BROKEN },
        ];
        await writeJsonAtomic(join(pipelineDir, 'references/python/easy.json'), {
            'py-easy-01': { docs, syntax: 'x', title: 't' },
        });
    });

    afterEach(async () => {
        await rm(pipelineDir, { force: true, recursive: true });
    });

    function run(fetched: string[], hostLists: (readonly string[])[]) {
        const fetchSource: SourceFetcher = async (url) => {
            fetched.push(url);
            return url === GOOD
                ? { contentType: 'text/html', finalUrl: url, ok: true, text: '<p>ok</p>' }
                : { ok: false, reason: 'bad-status' };
        };
        return verifyDocLinks({
            createFetcher: (hosts) => {
                hostLists.push(hosts);
                return fetchSource;
            },
            log: () => undefined,
            now: () => '2026-10-13T00:00:00.000Z',
            pipelineDir,
        });
    }

    it('records each link, fetches with the track hosts, and retries only failures', async () => {
        const hostLists: (readonly string[])[] = [];
        expect(await run([], hostLists)).toEqual({ failed: 1, passed: 1 });
        expect(hostLists).toEqual([['docs.python.org']]);
        const checks = JSON.parse(await readFile(join(pipelineDir, 'references/doc-links.json'), 'utf8'));
        expect(checks).toEqual({
            [BROKEN]: { checkedAt: '2026-10-13T00:00:00.000Z', ok: false, reason: 'bad-status' },
            [GOOD]: { checkedAt: '2026-10-13T00:00:00.000Z', ok: true },
        });
        const fetched: string[] = [];
        await run(fetched, []);
        expect(fetched).toEqual([BROKEN]);
    });
});
