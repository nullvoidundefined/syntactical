// B-3.2r1: with SKIP_DOCKER_TESTS=1 and no TEST_DATABASE_URL, the integration
// globalSetup starts no container (it never runs docker) and provides nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupTestDatabase } from '../../testing/setupTestDatabase.js';

const SAVED_KEYS = ['PATH', 'SKIP_DOCKER_TESTS', 'TEST_DATABASE_URL'] as const;

describe('setupTestDatabase', () => {
    const saved: Partial<Record<(typeof SAVED_KEYS)[number], string>> = {};

    beforeEach(() => {
        for (const key of SAVED_KEYS) {
            saved[key] = process.env[key];
        }
    });

    afterEach(() => {
        for (const key of SAVED_KEYS) {
            if (saved[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = saved[key];
            }
        }
    });

    it('starts no container and provides no URL when SKIP_DOCKER_TESTS=1', async () => {
        process.env.SKIP_DOCKER_TESTS = '1';
        delete process.env.TEST_DATABASE_URL;
        // With no PATH, any attempt to run docker fails.
        process.env.PATH = '';
        const provide = vi.fn();

        const setup = setupTestDatabase(provide);

        await expect(setup).resolves.toBeTypeOf('function');
        const teardown = await setup;
        expect(provide).not.toHaveBeenCalled();
        expect(teardown()).toBeUndefined();
    });
});
