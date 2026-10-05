// A topic track lists the runners its questions may use; each runner implies the card's grammar.
// Language tracks are never listed here: they keep ORACLE_LANGUAGES.
import { describe, expect, it } from 'vitest';

import { ORACLE_LANGUAGES } from '../../services/ORACLE_LANGUAGES.js';
import { RUNNER_GRAMMARS } from '../../services/RUNNER_GRAMMARS.js';
import { TRACK_RUNNERS } from '../../services/TRACK_RUNNERS.js';

describe('TRACK_RUNNERS', () => {
    it('lets backend-security use python, node, and postgres', () => {
        expect(TRACK_RUNNERS['backend-security']).toEqual(['python', 'node', 'postgres']);
    });

    it('lists no language track', () => {
        for (const languageId of Object.keys(ORACLE_LANGUAGES)) {
            expect(Object.hasOwn(TRACK_RUNNERS, languageId), languageId).toBe(false);
        }
    });
});

describe('RUNNER_GRAMMARS', () => {
    it.each([
        ['python', 'python'],
        ['postgres', 'sql'],
        ['node', 'javascript'],
    ] as const)('maps the %s runner to the %s grammar', (runner, grammar) => {
        expect(RUNNER_GRAMMARS[runner]).toBe(grammar);
    });
});
