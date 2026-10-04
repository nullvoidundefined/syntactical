// Runs purchaser calls one after another so a sign-out and the next sign-in
// keep their order, and no call holds the next one back past
// PURCHASER_CALL_TIMEOUT_MS. Never rejects; a failure logs a fixed
// error, never the SDK's own error (it can carry the user id).
import { PURCHASER_CALL_TIMEOUT_MS } from '../../constants/appConfig';
import { logWarning } from '../logClient';

import { purchaserQueue } from './purchaserQueue';

// Settles with the task, or rejects once the timeout passes; the timer is
// always cleared so it never outlives the call.
function withTimeout(task: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('purchases sdk call timed out')), PURCHASER_CALL_TIMEOUT_MS);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

export function enqueuePurchaserCall(task: () => Promise<void>, failure: string): Promise<void> {
  const run = purchaserQueue.tail
    .then(() => withTimeout(task()))
    .catch(() => {
      logWarning({ err: new Error('purchases sdk call failed') }, failure);
    });
  purchaserQueue.tail = run;
  return run;
}
