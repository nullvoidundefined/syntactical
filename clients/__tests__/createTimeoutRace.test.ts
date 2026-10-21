import { createTimeoutRace } from '../createTimeoutRace';

describe('createTimeoutRace', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('rejects with the built error and aborts at the deadline', async () => {
    const error = new Error('Timed out');
    const controller = new AbortController();
    const { promise } = createTimeoutRace(100, () => error, controller);
    const onReject = jest.fn();
    void promise.catch(onReject);
    const rejection = expect(promise).rejects.toBe(error);

    jest.advanceTimersByTime(99);
    await Promise.resolve();
    expect(onReject).not.toHaveBeenCalled();
    expect(controller.signal.aborted).toBe(false);

    jest.advanceTimersByTime(1);
    await rejection;
    expect(controller.signal.aborted).toBe(true);
  });

  it('does not reject or abort after being cleared', async () => {
    const controller = new AbortController();
    const { promise, clear } = createTimeoutRace(100, () => new Error('Timed out'), controller);
    const onReject = jest.fn();
    void promise.catch(onReject);

    jest.advanceTimersByTime(50);
    clear();
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    expect(onReject).not.toHaveBeenCalled();
    expect(controller.signal.aborted).toBe(false);
  });

  it('rejects at the deadline without a controller', async () => {
    const error = new Error('Timed out');
    const { promise } = createTimeoutRace(100, () => error);
    const onReject = jest.fn();
    void promise.catch(onReject);
    const rejection = expect(promise).rejects.toBe(error);

    jest.advanceTimersByTime(99);
    await Promise.resolve();
    expect(onReject).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await rejection;
  });
});
