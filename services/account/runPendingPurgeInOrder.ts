// Runs pending-purge list changes one at a time, so an add from the dialog and
// a remove from StatsProvider never read the same list and overwrite each other.
let queue: Promise<unknown> = Promise.resolve();

export function runPendingPurgeInOrder<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(() => undefined);
  return result;
}
