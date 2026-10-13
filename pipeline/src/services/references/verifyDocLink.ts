// Checks one documentation link: the page must load through the hardened source fetcher on the
// track's hosts, and when the URL names a section (`#fragment`), an element with that id or name
// must be on the page, so a link cannot point at a section the model made up.
import type { SourceFetcher } from '../../clients/sourceFetcher.js';
import type { SourceFetchFailure } from '../../types/SourceFetchResult.js';

export type DocLinkCheck = { ok: true } | { ok: false; reason: SourceFetchFailure | 'anchor-not-found' };

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasAnchor(html: string, fragment: string): boolean {
    let decoded = fragment;
    try {
        decoded = decodeURIComponent(fragment);
    } catch {
        // A malformed escape is matched as written.
    }
    return [fragment, decoded].some((name) =>
        new RegExp(
            `\\s(?:id|name)\\s*=\\s*(?:"${escapeRegExp(name)}"|'${escapeRegExp(name)}'|${escapeRegExp(name)}[\\s>])`,
        ).test(html),
    );
}

export async function verifyDocLink(rawUrl: string, fetchSource: SourceFetcher): Promise<DocLinkCheck> {
    const page = await fetchSource(rawUrl);
    if (!page.ok) return { ok: false, reason: page.reason };
    const fragment = new URL(rawUrl).hash.slice(1);
    if (fragment !== '' && !hasAnchor(page.text, fragment)) return { ok: false, reason: 'anchor-not-found' };
    return { ok: true };
}
