// B-3.3 (B-25): the Resend email client sends the sign-in code to the address and never logs
// the address or the code, on success or on failure.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createEmailClient } from '../../clients/emailClient.js';
import { createLogger } from '../../clients/logger.js';

const EMAIL_BYTES = 6;
const SENDER = 'Syntactical <sign-in@syntactical.dev>';
const CODE = '804613';
const MESSAGE_ID = 'resend-message-id';

interface SentPayload {
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string | string[];
}

type SendResult = { data: { id: string } | null; error: { message: string; name: string } | null };

function buildEmail(): string {
  return `learner-${randomBytes(EMAIL_BYTES).toString('hex')}@example.com`;
}

function createCapturedLogger() {
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

function createFakeResend(respond: (payload: SentPayload) => Promise<SendResult>) {
  const payloads: SentPayload[] = [];
  return {
    payloads,
    resend: {
      emails: {
        async send(payload: SentPayload): Promise<SendResult> {
          payloads.push(payload);
          return respond(payload);
        },
      },
    },
  };
}

function expectNoLineContains(lines: string[], values: string[]) {
  for (const line of lines) {
    for (const value of values) {
      expect(line).not.toContain(value);
    }
  }
}

describe('createEmailClient', () => {
  it('sends the code to the address from the configured sender', async () => {
    const { lines, logger } = createCapturedLogger();
    const { payloads, resend } = createFakeResend(async () => ({ data: { id: MESSAGE_ID }, error: null }));
    const email = buildEmail();

    await createEmailClient({ from: SENDER, logger, resend }).sendSignInCode(email, CODE);

    expect(payloads).toHaveLength(1);
    const [{ from, html, subject, text, to }] = payloads;
    expect(to).toBe(email);
    expect(from).toBe(SENDER);
    expect(subject.length).toBeGreaterThan(0);
    expect(text).toContain(CODE);
    expect(html).toContain(CODE);
    expect(lines.length).toBeGreaterThan(0);
    expectNoLineContains(lines, [email, CODE]);
  });

  it('carries no absolute URL in the message', async () => {
    const { logger } = createCapturedLogger();
    const { payloads, resend } = createFakeResend(async () => ({ data: { id: MESSAGE_ID }, error: null }));

    await createEmailClient({ from: SENDER, logger, resend }).sendSignInCode(buildEmail(), CODE);

    const [{ html, text }] = payloads;
    expect(`${html}\n${text}`).not.toMatch(/https?:\/\//);
  });

  it('rejects without the address or code in the error or any log line when Resend returns an error', async () => {
    const { lines, logger } = createCapturedLogger();
    const email = buildEmail();
    const { resend } = createFakeResend(async () => ({
      data: null,
      error: { message: `invalid recipient ${email} for ${CODE}`, name: 'validation_error' },
    }));

    const failure = await createEmailClient({ from: SENDER, logger, resend })
      .sendSignInCode(email, CODE)
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(Error);
    expect(String((failure as Error).message)).not.toContain(email);
    expect(String((failure as Error).message)).not.toContain(CODE);
    expect(lines.length).toBeGreaterThan(0);
    expectNoLineContains(lines, [email, CODE]);
  });

  it('rejects without the address in any log line when the Resend call throws', async () => {
    const { lines, logger } = createCapturedLogger();
    const email = buildEmail();
    const { resend } = createFakeResend(async () => {
      throw new Error(`network failure sending to ${email}`);
    });

    const failure = await createEmailClient({ from: SENDER, logger, resend })
      .sendSignInCode(email, CODE)
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(Error);
    expect(String((failure as Error).message)).not.toContain(email);
    expectNoLineContains(lines, [email, CODE]);
  });
});
