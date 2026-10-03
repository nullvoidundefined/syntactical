// Sends sign-in codes through Resend (ported from the template's emailService). The recipient
// address and the code never reach a log line or an error message: logs carry the Resend
// message id or the error's class only. The message holds no link, so it needs no absolute URL.
import type { Logger } from 'pino';

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
    send(payload: SignInEmail): Promise<{ data: { id: string } | null; error: { name: string } | null }>;
  };
}

interface EmailClientOptions {
  from: string;
  logger: Logger;
  resend: EmailSender;
}

const SUBJECT = 'Your Syntactical sign-in code';

function buildMessage(code: string): Pick<SignInEmail, 'html' | 'subject' | 'text'> {
  return {
    html: `<p>Your Syntactical sign-in code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not ask to sign in, ignore this email.</p>`,
    subject: SUBJECT,
    text: `Your Syntactical sign-in code is ${code}.\n\nIt expires in 10 minutes. If you did not ask to sign in, ignore this email.`,
  };
}

function createEmailClient(options: EmailClientOptions): EmailClient {
  const { from, logger, resend } = options;
  return {
    async sendSignInCode(email: string, code: string): Promise<void> {
      let result: Awaited<ReturnType<EmailSender['emails']['send']>>;
      try {
        result = await resend.emails.send({ ...buildMessage(code), from, to: email });
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
