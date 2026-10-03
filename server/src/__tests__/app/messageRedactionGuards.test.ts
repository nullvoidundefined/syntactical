// B-62h guard: the log line text stays readable in pino's msg.
import { describe, expect, it } from 'vitest';

import { createLogger } from '../../clients/logger.js';

describe('log line text', () => {
  it('keeps the log line text readable in msg', () => {
    const lines: string[] = [];
    const logger = createLogger({ destination: { write: (chunk: string) => lines.push(chunk) } });
    logger.info({ status: 'ok' }, 'request completed');
    expect(lines.join('')).toContain('"msg":"request completed"');
  });
});
