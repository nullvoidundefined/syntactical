import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { StatsProvider, useQuizStats } from '../../../state/StatsProvider';
import { QuizRound } from '../QuizRound';
import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';

const questions: Question[] = [{ answer: true, id: 'q-1', prompt: 'Is it?', query: { explanation: 'Because', title: 'Why' }, provenance: TEST_PROVENANCE, type: 'bool' }];

// Mounts the round only once stats have hydrated, as the round route does, so
// an immediate completion is not swallowed by the pre-hydration guard.
function AfterHydration({ children }: { children: ReactNode }) {
  const { isHydrated } = useQuizStats();
  return isHydrated ? children : null;
}

function CompletionsProbe() {
  const { isHydrated, stats } = useQuizStats();
  const completions = stats.tracks['python:easy']?.completions ?? 0;
  return <Text testID="completions">{isHydrated ? String(completions) : 'loading'}</Text>;
}

describe('QuizRound with the real stats provider', () => {
  beforeEach(() => AsyncStorage.clear());

  it('records exactly one completion when the round ends, even as stats change afterwards', async () => {
    await render(
      <StatsProvider>
        <CompletionsProbe />
        <QuizRound
          language="python"
          languageLabel="Python"
          difficulty="easy"
          difficultyLabel="Easy"
          grammar="python"
          questions={questions}
          onExit={() => undefined}
          onRetry={() => undefined}
        />
      </StatsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('completions').props.children).toBe('0'));
    await fireEvent.press(screen.getByText('True'));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByTestId('completions').props.children).toBe('1'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId('completions').props.children).toBe('1');
  });

  it('records no completion for a round with no questions', async () => {
    const noQuestions: Question[] = [];
    await render(
      <StatsProvider>
        <CompletionsProbe />
        <AfterHydration>
          <QuizRound language="python" languageLabel="Python" difficulty="easy" difficultyLabel="Easy" grammar="python" questions={noQuestions} onExit={() => undefined} onRetry={() => undefined} />
        </AfterHydration>
      </StatsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('completions').props.children).toBe('0'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId('completions').props.children).toBe('0');
  });
});
