// verifyDocLink with a scripted fetcher (no network): a failed fetch fails the link, and a
// `#fragment` must name an element id or name on the page.
import { describe, expect, it } from 'vitest';

import type { SourceFetcher } from '../../../clients/sourceFetcher.js';
import { verifyDocLink } from '../../../services/references/verifyDocLink.js';

const PAGE = '<h2 id="FUNCTIONS-STRING-OTHER">Other</h2><a name="legacy-anchor"></a><div id=bare-id>x</div>';

function fetcher(result: Awaited<ReturnType<SourceFetcher>>): SourceFetcher {
    return async () => result;
}

const OK_PAGE = fetcher({ contentType: 'text/html', finalUrl: 'https://x', ok: true, text: PAGE });
const BASE = 'https://www.postgresql.org/docs/current/functions-string.html';

describe('verifyDocLink', () => {
    it('passes a page that loads when the URL names no section', async () => {
        await expect(verifyDocLink(BASE, OK_PAGE)).resolves.toEqual({ ok: true });
    });

    it.each(['FUNCTIONS-STRING-OTHER', 'legacy-anchor', 'bare-id'])(
        'passes when #%s is on the page',
        async (anchor) => {
            await expect(verifyDocLink(`${BASE}#${anchor}`, OK_PAGE)).resolves.toEqual({ ok: true });
        },
    );

    it('fails when the named section is not on the page', async () => {
        await expect(verifyDocLink(`${BASE}#MADE-UP`, OK_PAGE)).resolves.toEqual({
            ok: false,
            reason: 'anchor-not-found',
        });
    });

    it('fails with the fetch reason when the page does not load', async () => {
        await expect(verifyDocLink(BASE, fetcher({ ok: false, reason: 'bad-status' }))).resolves.toEqual({
            ok: false,
            reason: 'bad-status',
        });
    });
});
