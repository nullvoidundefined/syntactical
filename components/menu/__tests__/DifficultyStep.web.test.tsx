import { render, screen } from '@testing-library/react';

import { DifficultyStep } from '../DifficultyStep';

jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [{ banks: { hard: { hash: 'b'.repeat(64), path: 'elixir/hard.json' } }, glyph: 'EX', grammar: 'plain', id: 'elixir', label: 'Elixir', tagline: 'Pipes.' }],
    schemaVersion: 2,
  }),
}));
jest.mock('../../../state/useQuestionBank', () => ({ useQuestionBank: () => ({ bank: { hash: 'b'.repeat(64), questions: [] }, status: 'ready' }) }));
jest.mock('../../../state/useIsOnline', () => ({ useIsOnline: () => true }));

describe('DifficultyStep on the web', () => {
  it('titles the difficulty screen with one level-one heading naming the language', () => {
    render(<DifficultyStep language="elixir" onSelectDifficulty={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Step 2 / Select difficulty Elixir');
  });
});
