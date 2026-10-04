// SignUpPrompt focus on dismissal (B-41, accessibility): "Not now" removes
// the prompt, and the button that held focus goes with it, so focus moves
// to Retry instead of falling to the document body. The stats mock keeps
// the dismissed flag in React state so the prompt really unmounts.
import { act, render, screen } from '@testing-library/react';

import { ResultsScreen } from '../../quiz/ResultsScreen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../state/AuthProvider', () => ({ useAuth: () => ({ isHydrated: true, isSignedIn: false }) }));
jest.mock('../../../state/StatsProvider', () => {
  const { useState } = jest.requireActual<typeof import('react')>('react');
  return {
    useQuizStats: () => {
      const [isSignUpPromptDismissed, setIsDismissed] = useState(false);
      return { dismissSignUpPrompt: () => setIsDismissed(true), isHydrated: true, stats: { isSignUpPromptDismissed } };
    },
  };
});

describe('SignUpPrompt dismissal on the web', () => {
  it('moves focus to Retry when "Not now" removes the prompt', () => {
    render(<ResultsScreen accuracy={50} correctCount={1} totalQuestions={2} languageLabel="Python" difficultyLabel="Easy" onMenu={jest.fn()} onRetry={jest.fn()} />);
    const notNow = screen.getByRole('button', { name: 'Not now' });
    act(() => notNow.focus());
    act(() => notNow.click());
    expect(screen.queryByRole('region', { name: 'Save your progress' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Retry' }));
  });
});
