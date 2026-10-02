import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Text } from 'react-native';

import type { Question } from '../../../services/content/types/Question';
import { QuizRound } from '../QuizRound';

// Reduced motion makes the query Modal close without a CSS animation;
// react-native-web unmounts an animated Modal only on animationend, which
// jsdom never fires.
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ isHydrated: true, recordAnswer: () => undefined, recordCompletion: () => undefined }),
}));

const query = { explanation: 'Because', title: 'Why' };
const mcQuestion: Question = { answerIndex: 2, choices: ['a', 'b', 'c', 'd'], id: 'q-1', prompt: 'Pick', query, type: 'mc' };
const boolQuestion: Question = { answer: true, id: 'q-2', prompt: 'Yes?', query, type: 'bool' };

function RoundHarness({ question }: { question: Question }) {
  const [isOnMenu, setIsOnMenu] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  if (isOnMenu) return <Text>menu screen</Text>;
  return (
    <>
      <Text>{`round ${roundKey}`}</Text>
      <QuizRound
        key={roundKey}
        language="python"
        languageLabel="Python"
        difficulty="easy"
        difficultyLabel="Easy"
        grammar="python"
        questions={[question]}
        onExit={() => setIsOnMenu(true)}
        onRetry={() => setRoundKey((previousKey) => previousKey + 1)}
      />
    </>
  );
}

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
}

describe('web keyboard navigation in a round', () => {
  it.each([
    ['1', 'a, incorrect'],
    ['3', 'c, correct'],
    ['4', 'd, incorrect'],
    ['A', 'a, incorrect'],
    ['c', 'c, correct'],
    ['D', 'd, incorrect'],
  ])('key %p selects a choice', (key, label) => {
    render(<RoundHarness question={mcQuestion} />);
    pressKey(key);
    expect(screen.queryByLabelText(label)).not.toBeNull();
  });

  it.each([
    ['t', 'True, correct'],
    ['F', 'False, incorrect'],
  ])('key %p answers a boolean question', (key, label) => {
    render(<RoundHarness question={boolQuestion} />);
    pressKey(key);
    expect(screen.queryByLabelText(label)).not.toBeNull();
  });

  it('ignores T on a multiple-choice question but answers with a choice key', () => {
    render(<RoundHarness question={mcQuestion} />);
    pressKey('t');
    expect(screen.queryByText('Continue')).toBeNull();
    pressKey('2');
    expect(screen.queryByLabelText('b, incorrect')).not.toBeNull();
  });

  it('ignores a choice key on a boolean question but answers with T', () => {
    render(<RoundHarness question={boolQuestion} />);
    pressKey('2');
    expect(screen.queryByText('Continue')).toBeNull();
    pressKey('t');
    expect(screen.queryByLabelText('True, correct')).not.toBeNull();
  });

  it('Enter does nothing before an answer and advances after one', () => {
    render(<RoundHarness question={mcQuestion} />);
    pressKey('Enter');
    expect(screen.queryByText('Pick')).not.toBeNull();
    pressKey('3');
    pressKey('Enter');
    expect(screen.queryByText('100%')).not.toBeNull();
  });

  it('Q toggles the query drawer', () => {
    render(<RoundHarness question={mcQuestion} />);
    pressKey('q');
    expect(screen.queryByText('Because')).not.toBeNull();
    pressKey('Q');
    expect(screen.queryByText('Because')).toBeNull();
  });

  it('Escape closes an open drawer before it leaves the round', () => {
    render(<RoundHarness question={mcQuestion} />);
    pressKey('q');
    pressKey('Escape');
    expect(screen.queryByText('Because')).toBeNull();
    expect(screen.queryByText('menu screen')).toBeNull();
    pressKey('Escape');
    expect(screen.queryByText('menu screen')).not.toBeNull();
  });

  it('ignores answer keys while the drawer is open', () => {
    render(<RoundHarness question={mcQuestion} />);
    pressKey('q');
    pressKey('3');
    pressKey('Escape');
    expect(screen.queryByLabelText('c, correct')).toBeNull();
    pressKey('3');
    expect(screen.queryByLabelText('c, correct')).not.toBeNull();
  });

  it('Enter retries and Escape returns to the menu from the results screen', () => {
    render(<RoundHarness question={mcQuestion} />);
    pressKey('3');
    pressKey('Enter');
    pressKey('Enter');
    expect(screen.queryByText('round 1')).not.toBeNull();
    expect(screen.queryByText('Pick')).not.toBeNull();
    pressKey('3');
    pressKey('Enter');
    pressKey('Escape');
    expect(screen.queryByText('menu screen')).not.toBeNull();
  });
});
