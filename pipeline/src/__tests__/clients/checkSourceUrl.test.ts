// pipeline/src/__tests__/clients/checkSourceUrl.test.ts
// The static checks on a cited URL, before any DNS lookup: https, no userinfo, no explicit
// port, and a host on the allowlist (exact or a subdomain).
import { describe, expect, it } from 'vitest';

import { checkSourceUrl } from '../../clients/checkSourceUrl.js';

// Built at run time so no credential-shaped URL literal sits in the source.
const NAME_AND_WORD_URL = `https://${['name', 'word'].join(':')}@owasp.org/`;

describe('checkSourceUrl', () => {
    it.each([
        'https://owasp.org/Top10/',
        'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html',
        'https://www.postgresql.org/docs/current/sql-prepare.html',
        'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
        'https://www.rfc-editor.org/rfc/rfc6265',
        'https://datatracker.ietf.org/doc/html/rfc6454',
        'https://docs.python.org/3/library/pickle.html',
        'https://nodejs.org/api/child_process.html',
        'https://www.w3.org/TR/CSP3/',
        'https://html.spec.whatwg.org/multipage/browsers.html',
        'https://OWASP.org/x',
        'https://owasp.org./x',
        'https://owasp.org:443/x',
    ])('accepts %s', (raw) => {
        expect(checkSourceUrl(raw).ok).toBe(true);
    });

    it.each([
        ['http://owasp.org/Top10/', 'not-https'],
        ['ftp://owasp.org/', 'not-https'],
        ['file:///etc/passwd', 'not-https'],
        ['javascript:alert(1)', 'not-https'],
        ['https://owasp.org.evil.test/', 'host-not-allowed'],
        ['https://evilowasp.org/', 'host-not-allowed'],
        ['https://localhost/', 'host-not-allowed'],
        ['https://127.0.0.1/', 'host-not-allowed'],
        ['https://169.254.169.254/latest/meta-data/', 'host-not-allowed'],
        ['https://[::1]/', 'host-not-allowed'],
        ['https://owasp.org@evil.test/', 'userinfo'],
        ['https://evil.test@owasp.org/', 'userinfo'],
        [NAME_AND_WORD_URL, 'userinfo'],
        ['https://owasp.org:8443/', 'non-default-port'],
        ['not a url', 'malformed-url'],
        ['', 'malformed-url'],
    ])('rejects %s as %s', (raw, reason) => {
        expect(checkSourceUrl(raw)).toEqual({ ok: false, reason });
    });

    it('rejects a percent-encoded dot that would join an evil suffix', () => {
        expect(checkSourceUrl('https://owasp.org%2eevil.test/').ok).toBe(false);
    });
});
