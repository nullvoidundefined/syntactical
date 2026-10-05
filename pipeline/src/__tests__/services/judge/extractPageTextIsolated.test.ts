import { describe, expect, it } from 'vitest';

import { extractPageText } from '../../../services/judge/extractPageText.js';
import { PAGE_PARSE_TIMEOUT_MS, extractPageTextIsolated } from '../../../services/judge/extractPageTextIsolated.js';

const PAGE_BYTES = 2_000_000;
const HTML = 'text/html';
const QUOTE = 'Use prepared statements with parameterized queries';
const ORDINARY_PAGE = `<nav>Site navigation</nav><main><p>${QUOTE}</p></main><footer>Site footer</footer>`;

function adoptionAgencyPage(): string {
    const prefix = '<b><div>';
    const suffix = '</b>';
    return `${prefix}${'<br>'.repeat(Math.floor((PAGE_BYTES - prefix.length - suffix.length) / 4))}${suffix}`;
}

describe('extractPageTextIsolated', () => {
    it.each([
        ['HTML with main content and site chrome', ORDINARY_PAGE, HTML],
        ['plain text', `  ${QUOTE}\nAnother line &amp; <b>literal markup</b>\n`, 'text/plain'],
    ])(
        'matches extractPageText exactly for %s',
        async (_name, body, contentType) => {
            await expect(extractPageTextIsolated(body, contentType)).resolves.toBe(extractPageText(body, contentType));
        },
        10_000,
    );

    it('refuses a 2 MB adoption-agency page within the default timeout and teardown allowance', async () => {
        const body = adoptionAgencyPage();
        const startedAt = Date.now();
        await expect(extractPageTextIsolated(body, HTML)).resolves.toBe('');
        expect(Date.now() - startedAt).toBeLessThan(PAGE_PARSE_TIMEOUT_MS + 1000);
    }, 10_000);

    it('refuses a tag with 60,000 distinct attributes within the default timeout and teardown allowance', async () => {
        const attributes = Array.from({ length: 60_000 }, (_, index) => `a${index}=""`).join(' ');
        const body = `<div ${attributes}>${QUOTE}</div>`;
        const startedAt = Date.now();
        await expect(extractPageTextIsolated(body, HTML)).resolves.toBe('');
        expect(Date.now() - startedAt).toBeLessThan(PAGE_PARSE_TIMEOUT_MS + 1000);
    }, 10_000);

    it('honors a 50 ms timeout for an adoption-agency page', async () => {
        const body = adoptionAgencyPage();
        const startedAt = Date.now();
        await expect(extractPageTextIsolated(body, HTML, { timeoutMs: 50 })).resolves.toBe('');
        expect(Date.now() - startedAt).toBeLessThan(1000);
    }, 10_000);

    it('resolves empty on heap exhaustion and can parse an ordinary page afterward', async () => {
        const paragraph = '<p>short text</p>';
        const body = paragraph.repeat(Math.floor(PAGE_BYTES / paragraph.length));
        await expect(extractPageTextIsolated(body, HTML, { maxHeapMb: 4 })).resolves.toBe('');
        await expect(extractPageTextIsolated(ORDINARY_PAGE, HTML)).resolves.toBe(extractPageText(ORDINARY_PAGE, HTML));
    }, 10_000);
});
