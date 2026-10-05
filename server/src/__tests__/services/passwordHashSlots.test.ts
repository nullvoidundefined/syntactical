// B-79 (service part): a process-wide semaphore admits at most `concurrency` derivations; a task
// that waits longer than the queue timeout for a slot rejects with HashSlotsBusy and never runs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ERROR_CODES } from '../../errors.js';
import { createPasswordHashSlots, HashSlotsBusy } from '../../services/passwordHashSlots.js';

const QUEUE_TIMEOUT_MS = 5_000;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

type Outcome<T> = { status: 'pending' } | { status: 'fulfilled'; value: T } | { status: 'rejected'; error: unknown };

// Observes a promise without leaving its rejection unhandled.
function track<T>(promise: Promise<T>): { readonly current: Outcome<T> } {
  const state: { current: Outcome<T> } = { current: { status: 'pending' } };
  promise.then(
    (value) => {
      state.current = { status: 'fulfilled', value };
    },
    (error: unknown) => {
      state.current = { status: 'rejected', error };
    },
  );
  return state;
}

// Counts tasks running at once and the highest count seen.
function createProbe() {
  const probe = { active: 0, maxActive: 0, started: [] as string[] };
  function task<T>(name: string, gate: Promise<T>): () => Promise<T> {
    return async () => {
      probe.started.push(name);
      probe.active += 1;
      probe.maxActive = Math.max(probe.maxActive, probe.active);
      try {
        return await gate;
      } finally {
        probe.active -= 1;
      }
    };
  }
  return { probe, task };
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPasswordHashSlots', () => {
  it('runs at most two tasks at once; a third starts only after one settles', async () => {
    const slots = createPasswordHashSlots({ concurrency: 2, queueTimeoutMs: QUEUE_TIMEOUT_MS });
    const { probe, task } = createProbe();
    const gates = [createDeferred<string>(), createDeferred<string>(), createDeferred<string>()];

    const results = gates.map((gate, index) => track(slots.run(task(`task${index}`, gate.promise))));
    await flush();

    expect(probe.started).toEqual(['task0', 'task1']);
    expect(probe.active).toBe(2);

    gates[0]!.resolve('first');
    await flush();

    expect(results[0]!.current).toEqual({ status: 'fulfilled', value: 'first' });
    expect(probe.started).toContain('task2');
    expect(probe.maxActive).toBe(2);

    gates[1]!.resolve('second');
    gates[2]!.resolve('third');
    await flush();

    expect(results[1]!.current).toEqual({ status: 'fulfilled', value: 'second' });
    expect(results[2]!.current).toEqual({ status: 'fulfilled', value: 'third' });
    expect(probe.maxActive).toBe(2);
  });

  it('frees the slot of a task that rejects and passes its error through', async () => {
    const slots = createPasswordHashSlots({ concurrency: 1, queueTimeoutMs: QUEUE_TIMEOUT_MS });
    const { probe, task } = createProbe();
    const failing = createDeferred<string>();
    const next = createDeferred<string>();
    const failure = new Error('derivation failed');

    const failed = track(slots.run(task('failing', failing.promise)));
    const queued = track(slots.run(task('next', next.promise)));
    await flush();
    expect(probe.started).toEqual(['failing']);

    failing.reject(failure);
    await flush();

    expect(failed.current).toEqual({ status: 'rejected', error: failure });
    expect(probe.started).toEqual(['failing', 'next']);
    next.resolve('done');
    await flush();
    expect(queued.current).toEqual({ status: 'fulfilled', value: 'done' });
  });

  it('rejects a task with HashSlotsBusy (SERVER_BUSY) after it waits past the queue timeout, without running it', async () => {
    const slots = createPasswordHashSlots({ concurrency: 2, queueTimeoutMs: QUEUE_TIMEOUT_MS });
    const { probe, task } = createProbe();
    const blockers = [createDeferred<string>(), createDeferred<string>()];
    blockers.forEach((gate, index) => track(slots.run(task(`blocker${index}`, gate.promise))));
    const waitingTask = vi.fn(async () => 'ran');

    const waiting = track(slots.run(waitingTask));
    await vi.advanceTimersByTimeAsync(QUEUE_TIMEOUT_MS - 1);

    expect(waiting.current).toEqual({ status: 'pending' });

    await vi.advanceTimersByTimeAsync(2);

    expect(waiting.current.status).toBe('rejected');
    const error = (waiting.current as { error: unknown }).error;
    expect(error).toBeInstanceOf(HashSlotsBusy);
    expect(error).toBeInstanceOf(Error);
    expect((error as HashSlotsBusy).code).toBe(ERROR_CODES.SERVER.BUSY);
    expect(waitingTask).not.toHaveBeenCalled();

    // The timed-out waiter must not take a slot when one frees later.
    blockers[0]!.resolve('done');
    await flush();
    expect(waitingTask).not.toHaveBeenCalled();
    const after = track(slots.run(task('after', Promise.resolve('after'))));
    await flush();
    expect(after.current).toEqual({ status: 'fulfilled', value: 'after' });
    expect(probe.maxActive).toBe(2);
  });

  it('runs a waiting task that gets a slot before the timeout, and never rejects it later', async () => {
    const slots = createPasswordHashSlots({ concurrency: 1, queueTimeoutMs: QUEUE_TIMEOUT_MS });
    const blocker = createDeferred<string>();
    const slow = createDeferred<string>();
    track(slots.run(() => blocker.promise));
    const waitingTask = vi.fn(() => slow.promise);

    const waiting = track(slots.run(waitingTask));
    await vi.advanceTimersByTimeAsync(QUEUE_TIMEOUT_MS - 1_000);
    blocker.resolve('done');
    await flush();

    expect(waitingTask).toHaveBeenCalledTimes(1);

    // The task runs past the queue timeout; the timeout bounds only the wait for a slot.
    await vi.advanceTimersByTimeAsync(QUEUE_TIMEOUT_MS * 2);
    expect(waiting.current).toEqual({ status: 'pending' });
    slow.resolve('finished');
    await flush();
    expect(waiting.current).toEqual({ status: 'fulfilled', value: 'finished' });
  });

  it('runs a task at once when a slot is free, with no queue delay', async () => {
    const slots = createPasswordHashSlots({ concurrency: 2, queueTimeoutMs: QUEUE_TIMEOUT_MS });

    const result = track(slots.run(async () => 'immediate'));
    await flush();

    expect(result.current).toEqual({ status: 'fulfilled', value: 'immediate' });
  });
});
