// Records a deleted account's user id in the durable pending-purge list. True
// once the id is in storage; the delete-account dialog awaits it before the
// sign-out is persisted.
import { writeJson } from '../../clients/writeJson';
import { PENDING_PURGE_STORAGE_KEY } from '../../constants/appConfig';

import { readPendingPurgeIds } from './readPendingPurgeIds';
import { runPendingPurgeInOrder } from './runPendingPurgeInOrder';

export function addPendingPurge(userId: string): Promise<boolean> {
  return runPendingPurgeInOrder(async () => {
    const ids = await readPendingPurgeIds();
    if (ids === null) return false;
    return ids.includes(userId) ? true : writeJson(PENDING_PURGE_STORAGE_KEY, [...ids, userId]);
  });
}
