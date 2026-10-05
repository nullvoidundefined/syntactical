// B-70 and B-71 (Task 7.3): the breach check sends only the first 5 uppercase hex characters of
// the SHA-1 of the normalized UTF-8 password, compares the 35-character suffix locally, treats
// count-0 padding lines as no match, and fails open: a client that rejects, returns non-200,
// returns a body over 256 KB, or does not answer within 2 seconds yields 'unknown' and exactly
// one warning { event: 'breach_check_unavailable' } with no password material in it.
// Every password is built at run time from random bytes; none is written as a literal.
import { createHash, randomBytes } from 'node:crypto';

import type { Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFakePasswordBreachClient } from '../../clients/fakePasswordBreachClient.js';
import { createLogger } from '../../clients/logger.js';
import type { PasswordBreachClient } from '../../clients/passwordBreachClient.js';
import { AUTH } from '../../constants/auth.js';
import { checkPasswordBreach } from '../../services/checkPasswordBreach.js';

const WARN_LEVEL = 40;
const UNAVAILABLE_EVENT = 'breach_check_unavailable';
const TIMEOUT_MS = 2_000;
const MAX_RESPONSE_BYTES = 262_144;
const PREFIX_LENGTH = 5;
const SUFFIX_LENGTH = 35;
const OTHER_LINES = 40;
const PINO_ENVELOPE_KEYS = ['hostname', 'level', 'msg', 'pid', 'time'];
const FAILURE_MODES = ['reject', 'status-500', 'oversize', 'hang'] as const;

interface CandidateMaterial {
  plaintext: string;
  prefix: string;
  sha1: string;
  suffix: string;
}

// A normalized candidate with ASCII, an accented letter, and an emoji, so a wrong encoding
// (UTF-16 or Latin-1 instead of UTF-8) gives a different SHA-1.
function buildCandidate(): string {
  const accented = String.fromCodePoint(0xe9);
  const emoji = String.fromCodePoint(0x1f511);
  return `${randomBytes(8).toString('hex')}${accented}${emoji}`.normalize('NFKC');
}

function describeCandidate(candidate: string): CandidateMaterial {
  const sha1 = createHash('sha1').update(Buffer.from(candidate, 'utf8')).digest('hex').toUpperCase();
  return { plaintext: candidate, prefix: sha1.slice(0, PREFIX_LENGTH), sha1, suffix: sha1.slice(PREFIX_LENGTH) };
}

function buildMaterial(): CandidateMaterial {
  return describeCandidate(buildCandidate());
}

// A random 35-character uppercase hex suffix that differs from `avoid`.
function randomSuffix(avoid: string): string {
  for (;;) {
    const generated = randomBytes(18).toString('hex').toUpperCase().slice(0, SUFFIX_LENGTH);
    if (generated !== avoid) return generated;
  }
}

// A range body like HIBP's: unrelated suffixes with counts, plus `extraLines`, joined by CRLF.
function buildRangeBody(avoid: string, extraLines: string[]): string {
  const lines: string[] = [];
  for (let index = 0; index < OTHER_LINES; index += 1) {
    lines.push(`${randomSuffix(avoid)}:${index + 1}`);
  }
  lines.splice(OTHER_LINES / 2, 0, ...extraLines);
  return lines.join('\r\n');
}

function captureLogger(): { lines: string[]; logger: Logger } {
  const lines: string[] = [];
  const logger = createLogger({
    destination: {
      write(chunk: string) {
        lines.push(...chunk.split('\n').filter((line) => line.length > 0));
      },
    },
  });
  return { lines, logger };
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function warnings(lines: string[]): Record<string, unknown>[] {
  return parseLines(lines).filter((entry) => entry.level === WARN_LEVEL);
}

// The log line without pino's own envelope (time, pid, hostname), whose digits could match a
// 5-character prefix by chance.
function withoutEnvelope(entry: Record<string, unknown>): Record<string, unknown> {
  const { hostname: _hostname, pid: _pid, time: _time, ...rest } = entry;
  return rest;
}

function expectNoCandidateMaterial(lines: string[], material: CandidateMaterial) {
  const forbidden = [
    material.plaintext,
    material.sha1,
    material.sha1.toLowerCase(),
    material.prefix,
    material.prefix.toLowerCase(),
    material.suffix,
    material.suffix.toLowerCase(),
  ];
  for (const entry of parseLines(lines)) {
    const serialized = JSON.stringify(withoutEnvelope(entry));
    for (const value of forbidden) {
      expect(serialized).not.toContain(value);
    }
  }
}

function expectOneUnavailableWarning(lines: string[]) {
  const warned = warnings(lines);
  expect(warned).toHaveLength(1);
  const [entry] = warned;
  const fields = Object.fromEntries(Object.entries(entry ?? {}).filter(([key]) => !PINO_ENVELOPE_KEYS.includes(key)));
  expect(fields).toEqual({ event: UNAVAILABLE_EVENT });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('breach check constants', () => {
  it('bounds the call at 2 seconds and the body at 256 KB', () => {
    expect(AUTH.BREACH_CHECK.TIMEOUT_MS).toBe(TIMEOUT_MS);
    expect(AUTH.BREACH_CHECK.MAX_RESPONSE_BYTES).toBe(MAX_RESPONSE_BYTES);
  });
});

describe('checkPasswordBreach k-anonymity', () => {
  it('sends exactly one request carrying only the 5-character uppercase SHA-1 prefix', async () => {
    const material = buildMaterial();
    const client = createFakePasswordBreachClient({
      ranges: { [material.prefix]: buildRangeBody(material.suffix, []) },
    });
    const { logger } = captureLogger();

    await checkPasswordBreach(material.plaintext, { client, logger });

    expect(client.requestedPrefixes).toEqual([material.prefix]);
    expect(client.requestedPrefixes[0]).toMatch(/^[0-9A-F]{5}$/);
  });

  it('passes the client nothing but the prefix and an abort signal', async () => {
    const material = buildMaterial();
    const calls: unknown[][] = [];
    const client = {
      fetchRange(...args: unknown[]) {
        calls.push(args);
        return Promise.resolve(buildRangeBody(material.suffix, []));
      },
    } as PasswordBreachClient;
    const { logger } = captureLogger();

    await checkPasswordBreach(material.plaintext, { client, logger });

    expect(calls).toHaveLength(1);
    const [args] = calls;
    expect(args).toHaveLength(2);
    expect(args?.[0]).toBe(material.prefix);
    expect(args?.[1]).toBeInstanceOf(AbortSignal);
    const serialized = JSON.stringify(args);
    expect(serialized).not.toContain(material.suffix);
    expect(serialized).not.toContain(material.suffix.toLowerCase());
    expect(serialized).not.toContain(material.plaintext);
  });

  it('hashes the UTF-8 bytes of the password it is given', async () => {
    const material = buildMaterial();
    const client = createFakePasswordBreachClient({
      ranges: { [material.prefix]: buildRangeBody(material.suffix, [`${material.suffix}:3`]) },
    });
    const { logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('breached');
    expect(client.requestedPrefixes).toEqual([material.prefix]);
  });
});

describe('checkPasswordBreach suffix comparison', () => {
  it("returns 'breached' when the suffix appears with a count above 0", async () => {
    const material = buildMaterial();
    const client = createFakePasswordBreachClient({
      ranges: { [material.prefix]: buildRangeBody(material.suffix, [`${material.suffix}:3`]) },
    });
    const { lines, logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('breached');
    expect(warnings(lines)).toHaveLength(0);
    expectNoCandidateMaterial(lines, material);
  });

  it("returns 'clear' when the suffix appears only as a count-0 padding line", async () => {
    const material = buildMaterial();
    const client = createFakePasswordBreachClient({
      ranges: { [material.prefix]: buildRangeBody(material.suffix, [`${material.suffix}:0`]) },
    });
    const { logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('clear');
  });

  it("returns 'clear' when the range does not hold the suffix", async () => {
    const material = buildMaterial();
    const client = createFakePasswordBreachClient({
      ranges: { [material.prefix]: buildRangeBody(material.suffix, []) },
    });
    const { lines, logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('clear');
    expect(warnings(lines)).toHaveLength(0);
  });

  it("returns 'clear' when a line differs from the suffix only in its last character", async () => {
    const material = buildMaterial();
    const last = material.suffix.at(-1);
    const nearMiss = material.suffix.slice(0, -1) + (last === '0' ? '1' : '0');
    const client = createFakePasswordBreachClient({
      ranges: { [material.prefix]: buildRangeBody(material.suffix, [`${nearMiss}:9`]) },
    });
    const { logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('clear');
  });

  it("returns 'clear' when a line holds only the first 34 characters of the suffix", async () => {
    const material = buildMaterial();
    const client = createFakePasswordBreachClient({
      ranges: { [material.prefix]: buildRangeBody(material.suffix, [`${material.suffix.slice(0, -1)}:9`]) },
    });
    const { logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('clear');
  });

  it('matches a lowercase suffix in the response', async () => {
    const material = buildMaterial();
    const client = createFakePasswordBreachClient({
      ranges: {
        [material.prefix]: buildRangeBody(material.suffix, [`${material.suffix.toLowerCase()}:3`]),
      },
    });
    const { logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('breached');
  });

  it('matches the suffix on the last line of a body with LF line endings and a trailing newline', async () => {
    const material = buildMaterial();
    const body = `${randomSuffix(material.suffix)}:2\n${material.suffix}:7\n`;
    const client = createFakePasswordBreachClient({ ranges: { [material.prefix]: body } });
    const { logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('breached');
  });

  it('matches the suffix on the last line of a CRLF body', async () => {
    const material = buildMaterial();
    const body = `${buildRangeBody(material.suffix, [])}\r\n${material.suffix}:12\r\n`;
    const client = createFakePasswordBreachClient({ ranges: { [material.prefix]: body } });
    const { logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('breached');
  });
});

describe('checkPasswordBreach fails open', () => {
  it.each(FAILURE_MODES.filter((mode) => mode !== 'hang'))(
    "returns 'unknown' and logs one name-only warning when the fake fails with %s",
    async (failure) => {
      const material = buildMaterial();
      const client = createFakePasswordBreachClient({ failure });
      const { lines, logger } = captureLogger();

      expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('unknown');
      expectOneUnavailableWarning(lines);
      expectNoCandidateMaterial(lines, material);
    },
  );

  it("returns 'unknown' when the fake hangs past the 2-second timeout, and not before it", async () => {
    vi.useFakeTimers();
    const material = buildMaterial();
    const client = createFakePasswordBreachClient({ failure: 'hang' });
    const { lines, logger } = captureLogger();
    let result: string | undefined;

    const pending = checkPasswordBreach(material.plaintext, { client, logger }).then((value: string) => {
      result = value;
      return value;
    });
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(result).toBe('unknown');
    await expect(pending).resolves.toBe('unknown');
    expectOneUnavailableWarning(lines);
    expectNoCandidateMaterial(lines, material);
  });

  it('aborts the signal it gave the client when the timeout fires', async () => {
    const material = buildMaterial();
    let received: AbortSignal | undefined;
    const client: PasswordBreachClient = {
      fetchRange(_prefix: string, signal: AbortSignal) {
        received = signal;
        return new Promise<string>(() => {});
      },
    };
    const { lines, logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger, timeoutMs: 20 })).toBe('unknown');
    expect(received?.aborted).toBe(true);
    expectOneUnavailableWarning(lines);
  });

  it('settles within a bounded time against a client that never answers and ignores the signal', async () => {
    const material = buildMaterial();
    const client: PasswordBreachClient = { fetchRange: () => new Promise<string>(() => {}) };
    const { logger } = captureLogger();
    const startedAt = Date.now();

    expect(await checkPasswordBreach(material.plaintext, { client, logger, timeoutMs: 20 })).toBe('unknown');
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("returns 'unknown' for a body over 256 KB even when it holds the suffix", async () => {
    const material = buildMaterial();
    const matchLine = `${material.suffix}:5`;
    const filler = `${randomSuffix(material.suffix)}:1\r\n`;
    const fillerCount = Math.ceil(MAX_RESPONSE_BYTES / filler.length) + 1;
    const body = filler.repeat(fillerCount) + matchLine;
    expect(Buffer.byteLength(body, 'utf8')).toBeGreaterThan(MAX_RESPONSE_BYTES);
    const client: PasswordBreachClient = { fetchRange: () => Promise.resolve(body) };
    const { lines, logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('unknown');
    expectOneUnavailableWarning(lines);
    expectNoCandidateMaterial(lines, material);
  });

  it('keeps the rejection message out of the log when the client error names the prefix and hash', async () => {
    const material = buildMaterial();
    const client: PasswordBreachClient = {
      fetchRange: (prefix: string) => Promise.reject(new Error(`range ${prefix} failed for ${material.sha1}`)),
    };
    const { lines, logger } = captureLogger();

    expect(await checkPasswordBreach(material.plaintext, { client, logger })).toBe('unknown');
    expectOneUnavailableWarning(lines);
    expectNoCandidateMaterial(lines, material);
  });
});
