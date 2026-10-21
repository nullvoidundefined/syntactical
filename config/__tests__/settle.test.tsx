import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { settle } from '../settle';

function DeferredText() {
  const [text, setText] = useState('Waiting');

  useEffect(() => {
    const timer = setTimeout(() => setText('Updated'), 0);
    return () => clearTimeout(timer);
  }, []);

  return <Text>{text}</Text>;
}

describe('settle', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('finishes a timer, promise, and nested timer chain under real timers', async () => {
    let finished = false;
    setTimeout(() => {
      void Promise.resolve().then(() => {
        setTimeout(() => {
          finished = true;
        }, 0);
      });
    }, 0);

    await settle();

    expect(finished).toBe(true);
  });

  it('does not wait for a long timer under real timers', async () => {
    let immediateFinished = false;
    let delayedFinished = false;
    setTimeout(() => {
      immediateFinished = true;
    }, 0);
    const delayedTimer = setTimeout(() => {
      delayedFinished = true;
    }, 100);

    try {
      await settle();

      expect(immediateFinished).toBe(true);
      expect(delayedFinished).toBe(false);
    } finally {
      clearTimeout(delayedTimer);
    }
  });

  it('flushes an effect timer state update without an act warning', async () => {
    const consoleError = jest.spyOn(console, 'error');

    try {
      const view = await render(<DeferredText />);

      await settle();

      expect(view.getByText('Updated')).toBeTruthy();
      const actWarnings = consoleError.mock.calls.filter((args) =>
        args.some((message) => typeof message === 'string' && message.includes('not wrapped in act')),
      );
      expect(actWarnings).toEqual([]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('resolves with fake timers and runs only timers due at the current virtual time', async () => {
    jest.useFakeTimers();

    try {
      let immediateFinished = false;
      let delayedFinished = false;
      setTimeout(() => {
        immediateFinished = true;
      }, 0);
      setTimeout(() => {
        delayedFinished = true;
      }, 50);
      const startedAt = Date.now();

      await settle();

      expect(immediateFinished).toBe(true);
      expect(delayedFinished).toBe(false);
      expect(Date.now()).toBe(startedAt);
    } finally {
      jest.useRealTimers();
    }
  });

  it('runs a pending zero-delay timer with one explicit round', async () => {
    let finished = false;
    setTimeout(() => {
      finished = true;
    }, 0);

    await settle(1);

    expect(finished).toBe(true);
  });
});
