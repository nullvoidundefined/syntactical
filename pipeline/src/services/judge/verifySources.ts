// The deterministic source check of the judged route: every cited source needs a non-blank title
// and a quote of at least MIN_QUOTE_LENGTH characters that appears, normalized, in the visible text
// of its page as fetched through the allowlisted source fetcher. A model cannot pass by inventing
// a citation, because the quote has to be on the real page.
import type { EvidenceSource } from '@syntactical/content-schema';

import type { SourceFetcher } from '../../clients/sourceFetcher.js';
import type { SourceFetchFailure } from '../../types/SourceFetchResult.js';

import { extractPageText } from './extractPageText.js';
import { normalizeQuoteText } from './normalizeQuoteText.js';

export const MIN_QUOTE_LENGTH = 20;

export type SourceCheck =
    | { ok: true }
    | { ok: false; reason: SourceFetchFailure | 'quote-not-found' | 'quote-too-short' | 'title-empty'; url: string };

export async function verifySources(
    sources: readonly EvidenceSource[],
    fetchSource: SourceFetcher,
): Promise<SourceCheck> {
    if (sources.length === 0) return { ok: false, reason: 'quote-not-found', url: '' };
    for (const { quote, title, url } of sources) {
        if (title.trim() === '') return { ok: false, reason: 'title-empty', url };
        const wanted = normalizeQuoteText(quote);
        if (wanted.length < MIN_QUOTE_LENGTH) return { ok: false, reason: 'quote-too-short', url };
        const page = await fetchSource(url);
        if (!page.ok) return { ok: false, reason: page.reason, url };
        if (!normalizeQuoteText(extractPageText(page.text, page.contentType)).includes(wanted))
            return { ok: false, reason: 'quote-not-found', url };
    }
    return { ok: true };
}
