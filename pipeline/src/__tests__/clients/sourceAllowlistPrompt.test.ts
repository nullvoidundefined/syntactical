// pipeline/src/__tests__/clients/sourceAllowlistPrompt.test.ts
// The security prompt lists the allowed source hosts in prose; this keeps it in step with the code.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SOURCE_ALLOWED_HOSTS } from '../../clients/SOURCE_ALLOWED_HOSTS.js';
import { SOURCE_FETCH_LIMITS } from '../../clients/SOURCE_FETCH_LIMITS.js';

const PROMPT = readFileSync(new URL('../../../prompts/generateSecurityQuestion.md', import.meta.url), 'utf8');

describe('source allowlist', () => {
    it('is exactly the ten spec hosts', () => {
        expect([...SOURCE_ALLOWED_HOSTS].sort()).toEqual([
            'cheatsheetseries.owasp.org',
            'datatracker.ietf.org',
            'developer.mozilla.org',
            'docs.python.org',
            'nodejs.org',
            'owasp.org',
            'postgresql.org',
            'rfc-editor.org',
            'w3.org',
            'whatwg.org',
        ]);
    });

    it('is named in full by the security prompt', () => {
        for (const host of SOURCE_ALLOWED_HOSTS) expect(PROMPT, host).toContain(host);
    });

    it('caps a fetch at 2 MB, 3 redirects, and 10 seconds', () => {
        expect(SOURCE_FETCH_LIMITS).toEqual({ maxBytes: 2 * 1024 * 1024, maxRedirects: 3, timeoutMs: 10_000 });
    });
});
