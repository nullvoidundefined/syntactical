import { fireEvent, render, screen } from '@testing-library/react-native';

import { TopicStep } from '../TopicStep';

// Pool sizes by difficulty: easy is unknown (no topic counts), medium 100, hard 15, expert 30.
jest.mock('../../../state/useLanguageManifest', () => {
  const bank = (topicCounts: Record<string, number>) => ({ hash: 'a'.repeat(64), path: 'python/x.json', topicCounts });
  return {
    useLanguageManifest: () => ({
      languages: [
        {
          banks: {
            easy: bank({}),
            expert: bank({ numbers: 10, strings: 20 }),
            hard: bank({ numbers: 5, strings: 10 }),
            medium: bank({ numbers: 40, strings: 60 }),
          },
          glyph: 'PY',
          grammar: 'python',
          id: 'python',
          label: 'Python',
          tagline: 't',
          topics: [
            { id: 'strings', label: 'Strings' },
            { id: 'numbers', label: 'Numbers' },
          ],
        },
      ],
      schemaVersion: 2,
    }),
  };
});

function renderStep(difficulty: string, onSelectLength = jest.fn(), onSelectTopic = jest.fn()) {
  return render(
    <TopicStep
      difficulty={difficulty}
      language="python"
      onBack={jest.fn()}
      onSelectLength={onSelectLength}
      onSelectTopic={onSelectTopic}
    />,
  );
}

describe('TopicStep round lengths', () => {
  it('shows 20, 50, and All questions for an unknown pool', async () => {
    await renderStep('easy');
    expect(screen.getByRole('button', { name: /^20 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^50 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^All questions/ })).toBeTruthy();
    expect(screen.getByText('A random 20 from this bank')).toBeTruthy();
    expect(screen.getByText('Every question in this bank')).toBeTruthy();
  });

  it('shows 20, 50, and All 100 questions for a pool of 100', async () => {
    await renderStep('medium');
    expect(screen.getByRole('button', { name: /^20 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^50 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^All 100 questions/ })).toBeTruthy();
  });

  it('shows only All 15 questions for a pool of 15', async () => {
    await renderStep('hard');
    expect(screen.getByRole('button', { name: /^All 15 questions/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^(20|50) questions/ })).toBeNull();
  });

  it('shows 20 and All 30 questions, not 50, for a pool of 30', async () => {
    await renderStep('expert');
    expect(screen.getByRole('button', { name: /^20 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^All 30 questions/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^50 questions/ })).toBeNull();
  });

  it('reports the length each card stands for: 20, 50, and undefined for all', async () => {
    const onSelectLength = jest.fn();
    await renderStep('medium', onSelectLength);
    await fireEvent.press(screen.getByRole('button', { name: /^20 questions/ }));
    await fireEvent.press(screen.getByRole('button', { name: /^50 questions/ }));
    await fireEvent.press(screen.getByRole('button', { name: /^All 100 questions/ }));
    expect(onSelectLength.mock.calls).toEqual([[20], [50], [undefined]]);
  });

  it('lists the length cards before the topics', async () => {
    await renderStep('medium');
    const titles = screen
      .getAllByText(/^(20 questions|50 questions|All 100 questions|Strings|Numbers)$/)
      .map((node) => node.props.children);
    expect(titles).toEqual(['20 questions', '50 questions', 'All 100 questions', 'Strings', 'Numbers']);
  });
});
