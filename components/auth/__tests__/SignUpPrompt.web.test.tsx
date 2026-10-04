// SignUpPrompt on the web (Task 3.13; B-41, B-64): a region named by its
// heading, native buttons reachable by keyboard, and Enter on a focused
// prompt button never reaching the results screen's Retry binding (the
// pressable consumes the key before it reaches the window listener).
import { act, render, screen } from '@testing-library/react';

import { ResultsScreen } from '../../quiz/ResultsScreen';

const mockDismiss = jest.fn();

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../state/AuthProvider', () => ({ useAuth: () => ({ isHydrated: true, isSignedIn: false }) }));
jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ dismissSignUpPrompt: mockDismiss, isHydrated: true, stats: { isSignUpPromptDismissed: false } }),
}));

function pressKeyOn(target: EventTarget, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
  });
}

function renderResults(onRetry: () => void) {
  render(<ResultsScreen accuracy={50} correctCount={1} totalQuestions={2} languageLabel="Python" difficultyLabel="Easy" onMenu={jest.fn()} onRetry={onRetry} />);
}

describe('SignUpPrompt on the web', () => {
  it('is a region named "Save your progress" holding a level-2 heading and two buttons', () => {
    renderResults(jest.fn());
    const region = screen.getByRole('region', { name: 'Save your progress' });
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe('Save your progress');
    expect(region.contains(heading)).toBe(true);
    expect(region.contains(screen.getByRole('button', { name: 'Sign up' }))).toBe(true);
    expect(region.contains(screen.getByRole('button', { name: 'Not now' }))).toBe(true);
  });

  it('activates a focused "Not now" with Enter without triggering Retry, while Enter elsewhere still retries', () => {
    const onRetry = jest.fn();
    renderResults(onRetry);
    const notNow = screen.getByRole('button', { name: 'Not now' });
    expect(notNow.tabIndex).toBe(0);
    act(() => notNow.focus());
    expect(document.activeElement).toBe(notNow);
    // A native button: the browser turns Enter into a click on it (jsdom does not, so the click is sent below).
    expect(notNow.tagName).toBe('BUTTON');
    pressKeyOn(notNow, 'Enter');
    expect(onRetry).not.toHaveBeenCalled();
    act(() => notNow.click());
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    act(() => notNow.blur());
    pressKeyOn(window, 'Enter');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
