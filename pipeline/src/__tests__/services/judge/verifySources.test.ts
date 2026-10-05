// pipeline/src/__tests__/services/judge/verifySources.test.ts
// A cited source passes only when its title is not blank, its quote is at least 20 characters,
// the page fetches, and the normalized quote appears in the page's visible text.
import { describe, expect, it } from 'vitest';

import type { SourceFetcher } from '../../../clients/sourceFetcher.js';
import { verifySources } from '../../../services/judge/verifySources.js';

const URL_A = 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html';
const URL_B = 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies';

function pages(byUrl: Record<string, string>, contentType = 'text/html'): SourceFetcher {
    return async (url) =>
        url in byUrl
            ? { contentType, finalUrl: url, ok: true, text: byUrl[url] as string }
            : { ok: false, reason: 'host-not-allowed' };
}

const source = (url: string, quote: string, title = 'A title') => ({ quote, title, url });

describe('verifySources', () => {
    it('finds a quote split across inline tags', async () => {
        const fetch = pages({ [URL_A]: '<p>Use <code>prepared statements</code> with parameterized queries.</p>' });
        expect(
            await verifySources([source(URL_A, 'Use prepared statements with parameterized queries')], fetch),
        ).toEqual({
            ok: true,
        });
    });

    it('matches curly quotes, dashes, case, and whitespace loosely', async () => {
        const fetch = pages({ [URL_A]: '<p>The “parameterized” query – always   bound</p>' });
        expect(await verifySources([source(URL_A, 'the "parameterized" query - ALWAYS bound')], fetch)).toEqual({
            ok: true,
        });
    });

    it('decodes entities before matching', async () => {
        const fetch = pages({ [URL_A]: '<p>Escape &lt;script&gt; &amp; quotes &#39;here&#39; too</p>' });
        expect(await verifySources([source(URL_A, "Escape <script> & quotes 'here' too")], fetch)).toEqual({
            ok: true,
        });
    });

    it('reads text/plain pages as they are', async () => {
        const fetch = pages(
            { [URL_A]: 'Servers MUST NOT send cookies with the Secure attribute over http' },
            'text/plain',
        );
        expect(
            await verifySources([source(URL_A, 'Servers MUST NOT send cookies with the Secure attribute')], fetch),
        ).toEqual({ ok: true });
    });

    it('ignores text that appears only inside a script block', async () => {
        const fetch = pages({
            [URL_A]: '<script>var q = "Use prepared statements with parameterized queries";</script><p>Other</p>',
        });
        expect(
            await verifySources([source(URL_A, 'Use prepared statements with parameterized queries')], fetch),
        ).toEqual({
            ok: false,
            reason: 'quote-not-found',
            url: URL_A,
        });
    });

    it('fails a quote that is not on the page', async () => {
        const fetch = pages({ [URL_A]: '<p>Something else entirely, at length.</p>' });
        expect(await verifySources([source(URL_A, 'Escaping user input by hand is sufficient')], fetch)).toEqual({
            ok: false,
            reason: 'quote-not-found',
            url: URL_A,
        });
    });

    it('passes the fetch failure through', async () => {
        expect(
            await verifySources(
                [source('https://owasp.org.evil.test/', 'Use prepared statements with parameterized queries')],
                pages({}),
            ),
        ).toEqual({ ok: false, reason: 'host-not-allowed', url: 'https://owasp.org.evil.test/' });
    });

    it('fails a quote shorter than 20 characters without fetching', async () => {
        let fetched = 0;
        const fetch: SourceFetcher = async () => {
            fetched += 1;
            return { ok: false, reason: 'network' };
        };
        expect(await verifySources([source(URL_A, 'Use bound params')], fetch)).toEqual({
            ok: false,
            reason: 'quote-too-short',
            url: URL_A,
        });
        expect(fetched).toBe(0);
    });

    it.each([[''], ['   ']])('fails a source whose title is %j without fetching', async (title) => {
        const fetch: SourceFetcher = async () => {
            throw new Error('blank title must not fetch');
        };
        expect(
            await verifySources(
                [source(URL_A, 'Use prepared statements with parameterized queries', title)],
                pages({}),
            ),
        ).toEqual({ ok: false, reason: 'title-empty', url: URL_A });
    });

    it('fails when any one of two sources fails', async () => {
        const fetch = pages({
            [URL_A]: '<p>Use prepared statements with parameterized queries</p>',
            [URL_B]: '<p>Nothing relevant on this page.</p>',
        });
        const result = await verifySources(
            [
                source(URL_A, 'Use prepared statements with parameterized queries'),
                source(URL_B, 'Lax cookies are withheld on cross-site POST'),
            ],
            fetch,
        );
        expect(result).toEqual({ ok: false, reason: 'quote-not-found', url: URL_B });
    });

    it('fails an empty source list', async () => {
        expect(await verifySources([], pages({}))).toEqual({ ok: false, reason: 'quote-not-found', url: '' });
    });
});

describe('visible text and quote boundaries', () => {
    const quote = 'Use prepared statements with parameterized queries';
    it.each([
        ['style', `<style>${quote}</style>`],
        ['attribute', `<p title="${quote}">Other</p>`],
        ['comment', `<!-- ${quote} -->`],
        ['noscript', `<noscript>${quote}</noscript>`],
        ['template', `<template>${quote}</template>`],
    ])('rejects a quote found only in a %s', async (_name, body) => {
        expect(await verifySources([source(URL_A, quote)], pages({ [URL_A]: body }))).toEqual({
            ok: false,
            reason: 'quote-not-found',
            url: URL_A,
        });
    });

    it('accepts a quote exactly 20 characters long', async () => {
        const exact = 'Use bound parameters';
        expect(exact).toHaveLength(20);
        expect(await verifySources([source(URL_A, exact)], pages({ [URL_A]: `<p>${exact}</p>` }))).toEqual({
            ok: true,
        });
    });

    it('rejects a 19-character quote even when it appears on the page', async () => {
        const short = 'Use bound parameter';
        expect(short).toHaveLength(19);
        expect(await verifySources([source(URL_A, short)], pages({ [URL_A]: short }))).toEqual({
            ok: false,
            reason: 'quote-too-short',
            url: URL_A,
        });
    });

    it('normalizes Unicode compatibility characters before matching', async () => {
        expect(
            await verifySources(
                [source(URL_A, quote)],
                pages({
                    [URL_A]: '<p>Ｕｓｅ prepared statements with parameterized queries</p>',
                }),
            ),
        ).toEqual({ ok: true });
    });
});
