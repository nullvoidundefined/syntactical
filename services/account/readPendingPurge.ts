// The user ids waiting for a local purge; empty when the list cannot be read.
import { readPendingPurgeIds } from './readPendingPurgeIds';
import { runPendingPurgeInOrder } from './runPendingPurgeInOrder';

export function readPendingPurge(): Promise<string[]> {
  return runPendingPurgeInOrder(async () => (await readPendingPurgeIds()) ?? []);
}
