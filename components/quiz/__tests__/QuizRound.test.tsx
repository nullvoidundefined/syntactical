import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Question } from '../../../services/content/types/Question';
import { QuizRound } from '../QuizRound';

const mockRecordAnswer = jest.fn();
const mockRecordCompletion = jest.fn();
jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ isHydrated: true, recordAnswer: mockRecordAnswer, recordCompletion: mockRecordCompletion }),
}));

const query = { explanation: 'Because', title: 'Why' };
const questions: Question[] = [{ answer: true, id: 'q-1', prompt: 'Is it?', query, type: 'bool' }];

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
    expect(mockRecordAnswer).toHaveBeenCalledWith({ difficulty: 'easy', language: 'python', wasCorrect: true });
  });

  it('records no completion when leaving early', async () => {
    const { onExit } = await renderRound();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to menu' }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(mockRecordCompletion).not.toHaveBeenCalled();
  });

  it('retries and returns to the menu from the results screen', async () => {
    const { onExit, onRetry } = await renderRound();
    await fireEvent.press(screen.getByText('True'));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
