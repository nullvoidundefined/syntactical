// Drops a user id from the pending-purge list once that user's local data is
// gone. True once the id is no longer in storage.
import { writeJson } from '../../clients/writeJson';
import { PENDING_PURGE_STORAGE_KEY } from '../../constants/appConfig';

import { readPendingPurgeIds } from './readPendingPurgeIds';
import { runPendingPurgeInOrder } from './runPendingPurgeInOrder';

export function removePendingPurge(userId: string): Promise<boolean> {
  return runPendingPurgeInOrder(async () => {
    const ids = await readPendingPurgeIds();
    if (ids === null) return false;
    return ids.includes(userId) ? writeJson(PENDING_PURGE_STORAGE_KEY, ids.filter((id) => id !== userId)) : true;
  });
}
