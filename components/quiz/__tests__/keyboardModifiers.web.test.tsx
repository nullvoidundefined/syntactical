import type { Question } from '@syntactical/content-schema';
import { act, render, screen } from '@testing-library/react';

import { QuizRound } from '../QuizRound';
import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({
    eventLog: [],
    isHydrated: true,
    recordAnswer: () => undefined,
    recordCompletion: () => undefined,
  }),
}));

const query = { explanation: 'Because', title: 'Why' };
const questions: Question[] = [
  {
    answerIndex: 2,
    choices: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }],
    id: 'q-1',
    prompt: 'First',
    query,
    provenance: TEST_PROVENANCE,
    type: 'mc',
  },
  {
    answerIndex: 0,
    choices: [{ text: 'w' }, { text: 'x' }, { text: 'y' }, { text: 'z' }],
    id: 'q-2',
    prompt: 'Second',
    query,
    provenance: TEST_PROVENANCE,
    type: 'mc',
  },
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
  return screen.queryAllByRole('button', { name: /,\s*(in)?correct$/ })[0] ?? null;
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
    expect(findAnsweredChoice()).not.toBeNull();
  });
});
