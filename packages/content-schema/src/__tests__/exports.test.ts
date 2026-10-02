import { expect, it } from 'vitest';

import * as schema from '../index.js';

it('exports the shared content contract', () => {
  for (const name of ['validateManifest', 'validateQuestionBank', 'isSafeBankPath', 'isRecord', 'SHA256_HEX', 'SUPPORTED_SCHEMA_VERSION', 'DIFFICULTIES', 'GRAMMARS', 'CONTENT_LIMITS', 'QUESTION_TYPES']) {
    expect(schema).toHaveProperty(name);
  }
});
