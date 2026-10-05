// Asks the breach range API whether a password has appeared in a known breach, by k-anonymity:
// only the first 5 hex characters of its SHA-1 leave the process. Fails open: any failure or a
// slow answer is 'unknown', logged once by name only, never with password material.
import { createHash } from 'node:crypto';

import type { Logger } from 'pino';

import type { PasswordBreachClient } from '../clients/passwordBreachClient.js';
import { AUTH } from '../constants/auth.js';

const PREFIX_LENGTH = 5;
const LINE_BREAK = /\r?\n/;

type BreachStatus = 'breached' | 'clear' | 'unknown';

interface BreachCheckDeps {
  client: PasswordBreachClient;
  logger: Logger;
  timeoutMs?: number;
}

function hasSuffixWithCount(body: string, suffix: string): boolean {
  return body.split(LINE_BREAK).some((line) => {
    const separator = line.indexOf(':');
    if (separator === -1) return false;
    const count = Number(line.slice(separator + 1).trim());
    return line.slice(0, separator).trim().toUpperCase() === suffix && count > 0;
  });
}

async function checkPasswordBreach(normalized: string, deps: BreachCheckDeps): Promise<BreachStatus> {
  const { client, logger, timeoutMs = AUTH.BREACH_CHECK.TIMEOUT_MS } = deps;
  const hash = createHash('sha1').update(normalized, 'utf8').digest('hex').toUpperCase();
  const prefix = hash.slice(0, PREFIX_LENGTH);
  const suffix = hash.slice(PREFIX_LENGTH);
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Breach check timed out'));
    }, timeoutMs);
  });
  try {
    const body = await Promise.race([client.fetchRange(prefix, controller.signal), timedOut]);
    if (Buffer.byteLength(body, 'utf8') > AUTH.BREACH_CHECK.MAX_RESPONSE_BYTES) {
      throw new Error('Breach range response too large');
    }
    return hasSuffixWithCount(body, suffix) ? 'breached' : 'clear';
  } catch {
    // The error is dropped on purpose: a client error message could name the prefix or hash.
    logger.warn({ event: 'breach_check_unavailable' }, 'password breach check unavailable');
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

export { checkPasswordBreach };
export type { BreachStatus };
