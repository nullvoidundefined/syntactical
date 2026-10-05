// Review findings on the page-text extractor (#73 round 1): text a reader cannot see must never
// back a quote, and text a reader can see must survive inline markup, named entities, and XHTML
// CDATA.
import { describe, expect, it } from 'vitest';

import { extractPageText } from '../../../services/judge/extractPageText.js';
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

    it('reads CDATA text in an XHTML page', () => {
        expect(visible(`<p><![CDATA[${Q}]]></p>`, 'application/xhtml+xml')).toContain(normalizeQuoteText(Q));
    });

    it('drops CDATA text in an HTML page, where it is a comment', () => {
        expect(visible(`<p><![CDATA[${Q}]]></p>`)).not.toContain(normalizeQuoteText(Q));
    });
});
