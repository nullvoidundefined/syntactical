import { ERROR_CODES } from '../errors.js';

interface PasswordHashSlotsOptions {
  concurrency: number;
  queueTimeoutMs: number;
}

interface Waiter {
  start: () => void;
  timer: NodeJS.Timeout;
}

class HashSlotsBusy extends Error {
  readonly code = ERROR_CODES.SERVER.BUSY;

  constructor() {
    super('All password hash slots are busy');
    this.name = 'HashSlotsBusy';
  }
}

// A semaphore: at most `concurrency` tasks run at once. A task waits up to `queueTimeoutMs` for a
// slot, then rejects with HashSlotsBusy and never runs. The timeout bounds the wait, not the task.
function createPasswordHashSlots({ concurrency, queueTimeoutMs }: PasswordHashSlotsOptions) {
  let active = 0;
  const queue: Waiter[] = [];

  function release(): void {
    const next = queue.shift();
    if (next) {
      // The slot passes straight to the waiter, so `active` is unchanged.
      clearTimeout(next.timer);
      next.start();
    } else {
      active -= 1;
    }
  }

  async function execute<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } finally {
      release();
    }
  }

  function run<T>(task: () => Promise<T>): Promise<T> {
    if (active < concurrency) {
      active += 1;
      return execute(task);
    }
    return new Promise<T>((resolve, reject) => {
      const waiter: Waiter = {
        start: () => {
          execute(task).then(resolve, reject);
        },
        timer: setTimeout(() => {
          const index = queue.indexOf(waiter);
          if (index !== -1) {
            queue.splice(index, 1);
          }
          reject(new HashSlotsBusy());
        }, queueTimeoutMs),
      };
      queue.push(waiter);
    });
  }

  return { run };
}

export { createPasswordHashSlots, HashSlotsBusy };
