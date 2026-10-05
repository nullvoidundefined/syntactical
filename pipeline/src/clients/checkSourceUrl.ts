// The checks a cited URL must pass before any DNS lookup: it parses, it is https, it carries no
// userinfo and no explicit non-443 port, and its host is allowlisted (exact or a dot-boundary
// subdomain). The URL comes from model output, so nothing here trusts its shape.
import { isIP } from 'node:net';

import type { SourceFetchFailure } from '../types/SourceFetchResult.js';

import { SOURCE_ALLOWED_HOSTS } from './SOURCE_ALLOWED_HOSTS.js';

export function isAllowedSourceHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    if (isIP(host.replace(/^\[|\]$/g, '')) !== 0) return false;
    return SOURCE_ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function checkSourceUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: SourceFetchFailure } {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { ok: false, reason: 'malformed-url' };
    }
    if (url.protocol !== 'https:') return { ok: false, reason: 'not-https' };
    if (url.username !== '' || url.password !== '') return { ok: false, reason: 'userinfo' };
    // The URL parser drops an explicit :443, so any port left here is a non-default one.
    if (url.port !== '') return { ok: false, reason: 'non-default-port' };
    if (!isAllowedSourceHost(url.hostname)) return { ok: false, reason: 'host-not-allowed' };
    return { ok: true, url };
}
