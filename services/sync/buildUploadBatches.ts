// Splits the user's unsynced, unheld events into upload batches, in log order.
import type { AnswerEvent } from '@syntactical/progress';

import { SYNC_BATCH_SIZE } from '../../constants/appConfig';
import type { LoggedAnswerEvent } from '../stats/types/LoggedAnswerEvent';

import { toAnswerEvent } from './toAnswerEvent';

export function buildUploadBatches(eventLog: LoggedAnswerEvent[], userId: string): AnswerEvent[][] {
  const pending = eventLog
    .filter(({ isHeld, isSynced, ownerUserId }) => ownerUserId === userId && !isSynced && !isHeld)
    .map(toAnswerEvent);
  const batches: AnswerEvent[][] = [];
  for (let start = 0; start < pending.length; start += SYNC_BATCH_SIZE) {
    batches.push(pending.slice(start, start + SYNC_BATCH_SIZE));
  }
  return batches;
}
