import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';

import { QuizRound } from '../QuizRound';
import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';

const mockRecordAnswer = jest.fn();
const mockRecordCompletion = jest.fn();
jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ isHydrated: true, recordAnswer: mockRecordAnswer, recordCompletion: mockRecordCompletion }),
}));

const query = { explanation: 'Because', title: 'Why' };
const questions: Question[] = [{ answer: true, id: 'q-1', prompt: 'Is it?', query, provenance: TEST_PROVENANCE, type: 'bool' }];

function RoundHarness() {
  const [isOnMenu, setIsOnMenu] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  if (isOnMenu) return <Text>menu screen</Text>;
  return (
    <QuizRound
      key={roundKey}
      language="python"
      languageLabel="Python"
      difficulty="easy"
      difficultyLabel="Easy"
      grammar="python"
      questions={questions}
      onExit={() => setIsOnMenu(true)}
      onRetry={() => setRoundKey((previousKey) => previousKey + 1)}
    />
  );
}

async function renderRound() {
  const handlers = { onExit: jest.fn(), onRetry: jest.fn() };
  await render(
    <QuizRound language="python" languageLabel="Python" difficulty="easy" difficultyLabel="Easy" grammar="python" questions={questions} {...handlers} />,
  );
  return handlers;
}

describe('QuizRound', () => {
  it('offers Explain after an incorrect answer, opening the query without advancing', async () => {
    await renderRound();
    await fireEvent.press(screen.getByText('False'));
    await fireEvent.press(screen.getByRole('button', { name: 'Explain' }));
    expect(screen.queryByText('Because')).not.toBeNull();
    expect(screen.queryByText('Is it?')).not.toBeNull();
  });

  it('ignores an answer pressed while the query drawer is open', async () => {
    await renderRound();
    await fireEvent.press(screen.getByRole('button', { name: 'Query' }));
    await fireEvent.press(screen.getByText('False'));
    await fireEvent.press(screen.getByRole('button', { name: 'Close query' }));
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Explain' })).toBeNull();
    expect(mockRecordAnswer).not.toHaveBeenCalled();
  });

  it('records a False answer to a true/false question as choice index 1, the order the card shows it', async () => {
    await renderRound();
    await fireEvent.press(screen.getByText('False'));
    expect(screen.queryByRole('button', { name: 'Explain' })).not.toBeNull();
    expect(mockRecordAnswer).toHaveBeenCalledWith(expect.objectContaining({ choiceIndex: 1, questionId: 'q-1', wasCorrect: false }));
  });

  it('records a topic round answer with the topic round kind and the bank key of its bank', async () => {
    const topical: Question[] = [{ ...questions[0], topic: 'numbers' }];
    await render(
      <QuizRound language="python" languageLabel="Python" difficulty="easy" difficultyLabel="Easy" grammar="python" questions={topical} topic="numbers" onExit={jest.fn()} onRetry={jest.fn()} />,
    );
    await fireEvent.press(screen.getByText('True'));
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeNull();
    expect(mockRecordAnswer).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'easy', language: 'python', roundKind: 'topic' }));
  });

  it('does not offer Explain after a correct answer', async () => {
    await renderRound();
    await fireEvent.press(screen.getByText('True'));
    expect(screen.queryByRole('button', { name: 'Explain' })).toBeNull();
  });

  it('closes the drawer when advancing, shows results, and records one completion', async () => {
    await renderRound();
    await fireEvent.press(screen.getByText('True'));
    await fireEvent.press(screen.getByRole('button', { name: 'Query' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText('Because')).toBeNull();
    expect(screen.queryByText('100%')).not.toBeNull();
    expect(screen.queryByText('1 of 1 correct')).not.toBeNull();
    expect(mockRecordCompletion).toHaveBeenCalledTimes(1);
    expect(mockRecordAnswer).toHaveBeenCalledWith({
      choiceIndex: 0,
      difficulty: 'easy',
      language: 'python',
      questionId: 'q-1',
      roundKind: 'bank',
      wasCorrect: true,
    });
  });

  it('records no completion when leaving early', async () => {
    await render(<RoundHarness />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back to menu' }));
    expect(screen.queryByText('menu screen')).not.toBeNull();
    expect(mockRecordCompletion).not.toHaveBeenCalled();
  });

  it('retries into a fresh round from the results screen', async () => {
    await render(<RoundHarness />);
    await fireEvent.press(screen.getByText('True'));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByText('1 of 1 correct')).toBeNull();
    expect(screen.queryByText('Is it?')).not.toBeNull();
  });

  it('returns to the menu from the results screen', async () => {
    await render(<RoundHarness />);
    await fireEvent.press(screen.getByText('True'));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.queryByText('menu screen')).not.toBeNull();
  });

  describe('rationale first in the query drawer', () => {
    const mcQuestions: Question[] = [
      {
        answerIndex: 1,
        choices: [{ rationale: 'You think the first one wins.', text: 'First' }, { text: 'Second' }, { text: 'Third' }],
        id: 'q-mc',
        prompt: 'Which?',
        provenance: TEST_PROVENANCE,
        query,
        type: 'mc',
      },
    ];

    async function renderMcRound(round: Question[] = mcQuestions) {
      await render(
        <QuizRound language="python" languageLabel="Python" difficulty="easy" difficultyLabel="Easy" grammar="python" questions={round} onExit={jest.fn()} onRetry={jest.fn()} />,
      );
    }

    it('opens Explain with the chosen wrong choice rationale above the query title', async () => {
      await renderMcRound();
      await fireEvent.press(screen.getByText('First'));
      await fireEvent.press(screen.getByRole('button', { name: 'Explain' }));
      const headings = screen.getAllByRole('heading').map((heading) => heading.props.children);
      expect(headings.indexOf('Why that answer is tempting')).toBeLessThan(headings.indexOf('Why'));
      expect(screen.getByText('You think the first one wins.')).toBeTruthy();
    });

    it('shows only the query when the Query button is used before answering', async () => {
      await renderMcRound();
      await fireEvent.press(screen.getByRole('button', { name: 'Query' }));
      expect(screen.queryByText('Why that answer is tempting')).toBeNull();
      expect(screen.getByText('Because')).toBeTruthy();
    });

    it('shows only the query when the Query button is used after a wrong answer', async () => {
      await renderMcRound();
      await fireEvent.press(screen.getByText('First'));
      await fireEvent.press(screen.getByRole('button', { name: 'Query' }));
      expect(screen.queryByText('Why that answer is tempting')).toBeNull();
    });

    it('shows only the query when the wrong choice has no rationale', async () => {
      await renderMcRound();
      await fireEvent.press(screen.getByText('Third'));
      await fireEvent.press(screen.getByRole('button', { name: 'Explain' }));
      expect(screen.queryByText('Why that answer is tempting')).toBeNull();
      expect(screen.getByText('Because')).toBeTruthy();
    });

    it('shows a true/false question rationale after the wrong value is chosen', async () => {
      await renderMcRound([{ ...questions[0], rationale: 'Booleans are not strings.' } as Question]);
      await fireEvent.press(screen.getByText('False'));
      await fireEvent.press(screen.getByRole('button', { name: 'Explain' }));
      expect(screen.getByText('Booleans are not strings.')).toBeTruthy();
    });

    it('does not carry the rationale into the Query button after the drawer closes', async () => {
      await renderMcRound();
      await fireEvent.press(screen.getByText('First'));
      await fireEvent.press(screen.getByRole('button', { name: 'Explain' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Close query' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Query' }));
      expect(screen.queryByText('Why that answer is tempting')).toBeNull();
    });
  });
});
