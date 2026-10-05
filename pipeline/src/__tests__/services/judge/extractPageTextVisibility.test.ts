// Review findings on the page-text extractor (#73 round 1): text a reader cannot see must never
// back a quote, and text a reader can see must survive inline markup, named entities, and XHTML
// CDATA.
import { describe, expect, it } from 'vitest';

import { MAX_NESTING_DEPTH, extractPageText } from '../../../services/judge/extractPageText.js';
import { normalizeQuoteText } from '../../../services/judge/normalizeQuoteText.js';

const Q = 'Use prepared statements with parameterized queries';
const HTML = 'text/html';

function visible(body: string, contentType = HTML): string {
    return normalizeQuoteText(extractPageText(body, contentType));
}

describe('extractPageText hides what a reader cannot see', () => {
    it('drops text inside a nested template', () => {
        expect(visible(`<p>before</p><template><template>inner</template>${Q}</template><p>after</p>`)).not.toContain(
            normalizeQuoteText(Q),
        );
    });

    it('does not end a script at a closer that is not a real end tag', () => {
        expect(visible(`<script>const x = "</script-extra>${Q}";</script><p>after</p>`)).not.toContain(
            normalizeQuoteText(Q),
        );
    });

    it.each([
        `<p hidden>${Q}</p>`,
        `<div hidden="">${Q}</div>`,
        `<section class="a" hidden><span>${Q}</span></section>`,
    ])('drops text inside an element with the hidden attribute: %s', (body) => {
        expect(visible(`${body}<p>shown</p>`)).not.toContain(normalizeQuoteText(Q));
        expect(visible(`${body}<p>shown</p>`)).toContain('shown');
    });

    it('keeps text after a hidden element that contains a nested element of the same name', () => {
        expect(visible(`<div hidden><div>inner</div>secret</div><p>${Q}</p>`)).toContain(normalizeQuoteText(Q));
        expect(visible(`<div hidden><div>inner</div>secret</div><p>${Q}</p>`)).not.toContain('secret');
    });

    it('does not treat a value that mentions hidden as the attribute', () => {
        expect(visible(`<p class="hidden-title" title="hidden">${Q}</p>`)).toContain(normalizeQuoteText(Q));
    });

    it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
        'leaves the unknown entity &%s; as written',
        (name) => {
            expect(extractPageText(`<p>&${name};</p>`, HTML)).toContain(`&${name};`);
        },
    );
});

describe('extractPageText keeps what a reader can see', () => {
    it('joins a word split by inline markup', () => {
        expect(visible('<p>Use para<strong>meterized</strong> queries to prevent injection</p>')).toContain(
            normalizeQuoteText('Use parameterized queries to prevent injection'),
        );
    });

    it('still separates words across block elements', () => {
        expect(visible('<p>first</p><p>second</p>')).toContain('first second');
    });

    it('decodes the em dash entity', () => {
        expect(extractPageText('<p>a &mdash; b</p>', HTML)).toContain(`a ${String.fromCodePoint(0x2014)} b`);
    });

    it.each([HTML, 'application/xhtml+xml'])(
        'drops CDATA text, which an HTML parse treats as a comment (%s)',
        (type) => {
            expect(visible(`<p><![CDATA[${Q}]]></p><p>after</p>`, type)).not.toContain(normalizeQuoteText(Q));
        },
    );
});

// Round 2 of the same review: parser edge cases a hand-written scanner missed. parse5 applies the
// HTML tokenizer rules, so each stays hidden.
describe('extractPageText follows the HTML parsing rules for hidden content', () => {
    it.each([
        ['a self-closing hidden div', `<div hidden/>${Q}</div><p>after</p>`],
        [
            'a self-closing template inside a template',
            `<template><template/>inner</template>${Q}</template><p>after</p>`,
        ],
        ['hidden after a slash', `<p/hidden>${Q}</p><p>after</p>`],
        ['hidden right after a quoted value', `<p title="x"hidden>${Q}</p><p>after</p>`],
        ['a script closer followed by a non-breaking space', `<script>x = "</script\u00a0>${Q}";</script><p>after</p>`],
        ['an end tag with a longer name', `<div hidden></div.foo>${Q}</div><p>after</p>`],
        ['a textarea inside a template', `<template><textarea></template>${Q}</textarea></template><p>after</p>`],
    ])('keeps the quote hidden: %s', (_name, body) => {
        expect(visible(body)).not.toContain(normalizeQuoteText(Q));
        expect(visible(body)).toContain('after');
    });

    it('keeps visible text whose attribute value is the word hidden', () => {
        expect(visible(`<p title= hidden>${Q}</p>`)).toContain(normalizeQuoteText(Q));
    });

    it('reads a quote nested to the depth limit', () => {
        const body = `${'<div>'.repeat(MAX_NESTING_DEPTH)}${Q}${'</div>'.repeat(MAX_NESTING_DEPTH)}`;
        expect(visible(body)).toContain(normalizeQuoteText(Q));
    });

    it('treats a page nested past the depth limit as having no visible text, quickly', () => {
        const depth = 200_000;
        const body = `${'<div>'.repeat(depth)}${Q}${'</div>'.repeat(depth)}`;
        const startedAt = Date.now();
        expect(visible(body)).toBe('');
        expect(Date.now() - startedAt).toBeLessThan(1000);
    });

    it('refuses deeply nested self-closing non-void elements, quickly', () => {
        const depth = 60_000;
        const body = `${'<div/>'.repeat(depth)}${Q}${'</div>'.repeat(depth)}`;
        const startedAt = Date.now();
        expect(visible(body)).toBe('');
        expect(Date.now() - startedAt).toBeLessThan(1000);
    });

    it('refuses deep nesting with a less-than sign in a quoted attribute, quickly', () => {
        const body = `${'<div title="<">'.repeat(60_000)}${Q}`;
        const startedAt = Date.now();
        expect(visible(body)).toBe('');
        expect(Date.now() - startedAt).toBeLessThan(1000);
    });

    // Found while fixing the two shapes above: a source-text count is also fooled by end tags the
    // parser ignores, and depth times unmatched end tags is quadratic even under the limit.
    it('refuses depth hidden behind end tags the parser ignores, quickly', () => {
        const body = `${'<div></span>'.repeat(60_000)}${Q}`;
        const startedAt = Date.now();
        expect(visible(body)).toBe('');
        expect(Date.now() - startedAt).toBeLessThan(1000);
    });

    it('parses a page at the depth limit followed by 1 MB of unmatched end tags quickly', () => {
        const body = `${'<span>'.repeat(MAX_NESTING_DEPTH)}${Q}${'</x>'.repeat(250_000)}`;
        const startedAt = Date.now();
        expect(visible(body)).toContain(normalizeQuoteText(Q));
        expect(Date.now() - startedAt).toBeLessThan(1000);
    });

    // Security review round 1: the parser rebuilds every open formatting element at each <p>, so a
    // shallow page can still create millions of nodes; and depth times a stack-walking tag stays slow.
    it('refuses a page that rebuilds formatting elements at every paragraph, quickly', () => {
        const formatting = Array.from({ length: 254 }, (_, index) => `<b a="${index}">`).join('');
        const body = `<p>${formatting}</p>${'<p>x</p>'.repeat(50_000)}${Q}`;
        const startedAt = Date.now();
        expect(visible(body)).toBe('');
        expect(Date.now() - startedAt).toBeLessThan(1000);
    });

    it('parses a page at the depth limit followed by 1 MB of list items quickly', () => {
        const body = `${'<div>'.repeat(MAX_NESTING_DEPTH - 1)}${Q}${'<li>'.repeat(250_000)}`;
        const startedAt = Date.now();
        expect(visible(body)).toContain(normalizeQuoteText(Q));
        expect(Date.now() - startedAt).toBeLessThan(1000);
    });

    it('keeps a quote after many self-closing void elements', () => {
        const body = `${'<br/>'.repeat(60_000)}${Q}`;
        expect(visible(body)).toContain(normalizeQuoteText(Q));
    });
});
