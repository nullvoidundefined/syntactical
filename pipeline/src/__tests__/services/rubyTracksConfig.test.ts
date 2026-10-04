// Ruby and Rails tracks: the content ids `ruby` and `rails` map to their own oracle runners, an
// oracle file in either language reads back, and pipeline/topics.json gives each a fallback topic
// list. Rails gets framework topics rather than the language list.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ORACLE_LANGUAGES } from '../../services/ORACLE_LANGUAGES.js';
import { readFallbackTopics } from '../../services/classify/readFallbackTopics.js';
import { readExistingOracles } from '../../services/readExistingOracles.js';

const TOPICS_FILE = fileURLToPath(new URL('../../../topics.json', import.meta.url));

const RAILS_TOPICS = [
    'activerecord-queries',
    'associations',
    'callbacks-and-validations',
    'migrations-and-schema',
    'routing',
    'controllers-and-params',
    'activesupport',
    'background-jobs',
    'security',
    'performance',
];

describe('ruby and rails oracle languages', () => {
    it.each(['ruby', 'rails'])('maps the %s content id to its own runner', (id) => {
        expect(ORACLE_LANGUAGES[id]).toBe(id);
    });

    it('reads back an oracle file holding ruby and rails oracles', async () => {
        const file = join(mkdtempSync(join(tmpdir(), 'oracles-')), 'ruby.json');
        writeFileSync(
            file,
            JSON.stringify({
                'rb-1': { code: 'puts 1', language: 'ruby' },
                'rr-1': { code: 'puts 1.day.to_i', language: 'rails' },
            }),
        );

        const oracles = await readExistingOracles(file);

        expect(oracles.get('rb-1')).toEqual({ code: 'puts 1', language: 'ruby' });
        expect(oracles.get('rr-1')).toEqual({ code: 'puts 1.day.to_i', language: 'rails' });
    });
});

describe('ruby and rails fallback topics', () => {
    it('gives ruby the shared language topics', async () => {
        const topics = await readFallbackTopics(TOPICS_FILE);

        expect(topics.ruby).toEqual(topics.python);
    });

    it('gives rails its framework topics', async () => {
        const topics = await readFallbackTopics(TOPICS_FILE);

        expect(topics.rails).toEqual(RAILS_TOPICS);
    });
});
