// A logger built like the server's own (createLogger, so the real redaction rules apply) that
// records each line as a parsed object, with pino's numeric level mapped to its label.
import { pino } from 'pino';
import type { Logger } from 'pino';

import { createLogger } from '../../clients/logger.js';

interface RecordingLogger {
  entries: Array<Record<string, unknown>>;
  logger: Logger;
}

function createRecordingLogger(): RecordingLogger {
  const entries: Array<Record<string, unknown>> = [];
  const logger = createLogger({
    destination: {
      write(chunk: string) {
        const line = JSON.parse(chunk) as Record<string, unknown>;
        const level = typeof line.level === 'number' ? pino.levels.labels[line.level] : line.level;
        entries.push({ ...line, level });
      },
    },
  });
  return { entries, logger };
}

export { createRecordingLogger };
