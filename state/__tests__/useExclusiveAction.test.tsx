import { act, renderHook } from '@testing-library/react-native';

import { useExclusiveAction } from '../useExclusiveAction';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useExclusiveAction', () => {
  it('starts idle and invokes work, resolving to its result', async () => {
    const { result } = await renderHook(() => useExclusiveAction());
    const value = { outcome: 'completed' };
    const work = jest.fn(async () => value);
    expect(result.current.isBusy).toBe(false);

    await act(async () => {
      await expect(result.current.run(work)).resolves.toBe(value);
    });

    expect(work).toHaveBeenCalledTimes(1);
    expect(result.current.isBusy).toBe(false);
  });

  it('stays busy while work is pending, skips a concurrent run, and permits another run after resolution', async () => {
    const { result } = await renderHook(() => useExclusiveAction());
    const deferred = createDeferred<string>();
    const work = jest.fn(() => deferred.promise);
    const skippedWork = jest.fn(async () => 'must not run');
    let firstRun!: Promise<string | undefined>;
    let secondRun!: Promise<string | undefined>;

    await act(async () => {
      firstRun = result.current.run(work);
      secondRun = result.current.run(skippedWork);
    });

    expect(result.current.isBusy).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    await expect(secondRun).resolves.toBeUndefined();
    expect(skippedWork).not.toHaveBeenCalled();
    expect(result.current.isBusy).toBe(true);

    await act(async () => {
      deferred.resolve('first result');
      await expect(firstRun).resolves.toBe('first result');
    });
    expect(result.current.isBusy).toBe(false);

    const nextWork = jest.fn(async () => 'next result');
    await act(async () => {
      await expect(result.current.run(nextWork)).resolves.toBe('next result');
    });
    expect(nextWork).toHaveBeenCalledTimes(1);
    expect(result.current.isBusy).toBe(false);
  });

  it('propagates a work rejection, clears busy, and permits another run', async () => {
    const { result } = await renderHook(() => useExclusiveAction());
    const deferred = createDeferred<string>();
    const failure = new Error('Work failed');
    let pendingRun!: Promise<string | undefined>;

    await act(async () => {
      pendingRun = result.current.run(() => deferred.promise);
    });
    expect(result.current.isBusy).toBe(true);

    await act(async () => {
      const rejection = expect(pendingRun).rejects.toBe(failure);
      deferred.reject(failure);
      await rejection;
    });
    expect(result.current.isBusy).toBe(false);

    const nextWork = jest.fn(async () => 'recovered');
    await act(async () => {
      await expect(result.current.run(nextWork)).resolves.toBe('recovered');
    });
    expect(nextWork).toHaveBeenCalledTimes(1);
    expect(result.current.isBusy).toBe(false);
  });
});
