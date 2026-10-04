// The PostHog project key reaches the bundle only from POSTHOG_KEY, and only
// with its public prefix (phc_); an unset key stays undefined (analytics is then
// a no-op), and a bad value fails the load without echoing it. Keys are built
// at run time so no credential-shaped literal sits in source.
import { randomBytes } from 'node:crypto';

import type { ExpoConfig } from 'expo/config';

const originalKey = process.env.POSTHOG_KEY;

function loadExtra(): Record<string, unknown> {
    let config: ExpoConfig | undefined;
    jest.isolateModules(() => {
        config = require('../../app.config').default as ExpoConfig;
    });
    return (config?.extra ?? {}) as Record<string, unknown>;
}

describe('app.config PostHog key', () => {
    afterEach(() => {
        if (originalKey === undefined) delete process.env.POSTHOG_KEY;
        else process.env.POSTHOG_KEY = originalKey;
    });

    it('carries a public-prefixed key in extra', () => {
        const key = `phc_${randomBytes(12).toString('hex')}`;
        process.env.POSTHOG_KEY = key;
        expect(loadExtra().posthogKey).toBe(key);
    });

    it('leaves the key undefined when unset', () => {
        delete process.env.POSTHOG_KEY;
        expect(loadExtra().posthogKey).toBeUndefined();
    });

    it('refuses a personal API key shape without echoing it', () => {
        const value = `phx_${randomBytes(12).toString('hex')}`;
        process.env.POSTHOG_KEY = value;
        let error: unknown = null;
        try {
            loadExtra();
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('POSTHOG_KEY');
        expect((error as Error).message).not.toContain(value);
    });
});
