import { describe, expect, it } from 'vitest';

import { pickProviderKind } from '../../services/pickProviderKind.js';

describe('pickProviderKind', () => {
    it('picks the API provider only for --api', () => {
        expect(pickProviderKind(['node', 'cli.ts', 'draft-oracles', '--api'])).toBe('api');
    });

    it.each([[[]], [['node', 'cli.ts', 'draft-oracles']], [['node', 'cli.ts', 'draft-oracles', '--API']], [['--apis', 'api']]])(
        'picks the CLI provider for %j',
        (argv) => {
            expect(pickProviderKind(argv)).toBe('cli');
        },
    );
});
