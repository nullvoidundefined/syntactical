// Stands in for the Resend client when RESEND_API_KEY is not configured (stub mode). It sends
// nothing. The one log line carries no address, code, or body, so a stubbed deploy leaks nothing
// and sign-in codes are never delivered.
import type { Logger } from 'pino';

import type { EmailClient } from './emailTypes.js';

function createStubEmailClient(logger: Logger): EmailClient {
  return {
    async sendSignInCode(): Promise<void> {
      logger.warn('email not sent: email provider not configured');
    },
  };
}

export { createStubEmailClient };
