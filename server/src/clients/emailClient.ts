// Sends sign-in codes through Resend (ported from the template's emailService). The recipient
// address and the code never reach a log line or an error message: logs carry the Resend
// message id or the error's class only. The message holds no link, so it needs no absolute URL.
// Every send has a deadline: Resend gets an abort signal, and the client stops waiting when it
// fires even if the SDK does not, because the caller sends inside a database transaction.
import type { Logger } from 'pino';

import { AUTH } from '../constants/auth.js';

import type { EmailClient } from './emailTypes.js';

interface SignInEmail {
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string;
}

// The slice of the Resend SDK this client uses; `new Resend(RESEND_API_KEY)` satisfies it.
interface EmailSender {
  emails: {
    send(
      payload: SignInEmail,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: { id: string } | null; error: { name: string } | null }>;
  };
}

interface EmailClientOptions {
  from: string;
  logger: Logger;
  resend: EmailSender;
  // Defaults to AUTH.EMAIL.SEND_TIMEOUT_MS; tests pass a short one.
  sendTimeoutMs?: number;
}

const SUBJECT = 'Your Syntactical sign-in code';

function buildMessage(code: string): Pick<SignInEmail, 'html' | 'subject' | 'text'> {
  return {
    html: `<p>Your Syntactical sign-in code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not ask to sign in, ignore this email.</p>`,
    subject: SUBJECT,
    text: `Your Syntactical sign-in code is ${code}.\n\nIt expires in 10 minutes. If you did not ask to sign in, ignore this email.`,
  };
}

// Settles with the send, or rejects when the signal fires, whichever comes first.
function untilAborted<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  const aborted = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('sign-in email deadline passed')), { once: true });
  });
  return Promise.race([pending, aborted]);
}

function createEmailClient(options: EmailClientOptions): EmailClient {
  const { from, logger, resend, sendTimeoutMs = AUTH.EMAIL.SEND_TIMEOUT_MS } = options;
  return {
    async sendSignInCode(email: string, code: string): Promise<void> {
      let result: Awaited<ReturnType<EmailSender['emails']['send']>>;
      try {
        const signal = AbortSignal.timeout(sendTimeoutMs);
        result = await untilAborted(resend.emails.send({ ...buildMessage(code), from, to: email }, { signal }), signal);
      } catch (error) {
        logger.error(
          { errorName: error instanceof Error ? error.name : typeof error, event: 'sign_in_email_failed' },
          'sign-in email request failed',
        );
        throw new Error('sign-in email request failed');
      }
      const { data, error } = result;
      if (error) {
        logger.error({ errorName: error.name, event: 'sign_in_email_failed' }, 'sign-in email rejected');
        throw new Error('sign-in email rejected');
      }
      logger.info({ event: 'sign_in_email_sent', messageId: data?.id }, 'sign-in email sent');
    },
  };
}

export { createEmailClient };
