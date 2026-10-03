// `runOracle` rejects a language outside the closed union before it builds an image path or
// starts Docker. No Docker is needed: the rejection happens first.
import { describe, expect, it } from 'vitest';

import { runOracle } from '../../clients/dockerRunner.js';
import type { OracleLanguage } from '../../types/OracleLanguage.js';

describe('runOracle language check', () => {
    it.each(['../../etc', 'ruby', '', 'python/../node'])(
        'returns a RunnerFailure for the unknown language %j',
        async (language) => {
            const run = await runOracle({ code: 'x', language: language as OracleLanguage });

            expect(run).toEqual({ exceptionType: 'RunnerFailure', outcome: 'exception' });
        },
    );
});
