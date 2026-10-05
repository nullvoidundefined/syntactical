// The outcome of fetching one cited source: the page text, or the boundary it failed.
export type SourceFetchFailure =
    | 'bad-status'
    | 'content-type'
    | 'dns-failed'
    | 'host-not-allowed'
    | 'malformed-url'
    | 'network'
    | 'non-default-port'
    | 'not-https'
    | 'private-address'
    | 'timeout'
    | 'too-large'
    | 'too-many-redirects'
    | 'userinfo';

export type SourceFetchResult =
    | { contentType: string; finalUrl: string; ok: true; text: string }
    | { ok: false; reason: SourceFetchFailure };
