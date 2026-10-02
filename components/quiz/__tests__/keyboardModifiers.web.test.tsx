import { act, render, screen } from '@testing-library/react';

import type { Question } from '../../../services/content/types/Question';
import { QuizRound } from '../QuizRound';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ isHydrated: true, recordAnswer: () => undefined, recordCompletion: () => undefined }),
}));

const query = { explanation: 'Because', title: 'Why' };
const questions: Question[] = [
  { answerIndex: 2, choices: ['a', 'b', 'c', 'd'], id: 'q-1', prompt: 'First', query, type: 'mc' },
  { answerIndex: 0, choices: ['w', 'x', 'y', 'z'], id: 'q-2', prompt: 'Second', query, type: 'mc' },
];

function renderRound() {
  render(
    <QuizRound
      language="python"
      languageLabel="Python"
      difficulty="easy"
      difficultyLabel="Easy"
      grammar="python"
      questions={questions}
      onExit={() => undefined}
      onRetry={() => undefined}
    />,
  );
}

function pressKey(key: string, modifiers: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, ...modifiers }));
  });
}

function findAnsweredChoice(): Element | null {
  return document.querySelector('[aria-label$=", correct"], [aria-label$=", incorrect"]');
}

describe('web keyboard bindings and browser shortcuts', () => {
  it.each([
    ['c', { metaKey: true }],
    ['a', { ctrlKey: true }],
    ['1', { altKey: true }],
  ])('ignores %p pressed with a modifier, then answers on the plain key', (key, modifiers) => {
    renderRound();
    pressKey(key, modifiers);
    expect(findAnsweredChoice()).toBeNull();
    pressKey(key);
    expect(findAnsweredChoice()).not.toBeNull();
  });

  it('ignores an auto-repeated Enter so a held key cannot skip questions', () => {
    renderRound();
    pressKey('3');
    pressKey('Enter');
    const promptAfterAdvance = screen.queryByText('First') ? 'First' : 'Second';
    pressKey('1');
    pressKey('Enter', { repeat: true });
    expect(screen.queryByText(promptAfterAdvance)).not.toBeNull();
    expect(screen.queryByText(/correct$/)).toBeNull();
  });
});
