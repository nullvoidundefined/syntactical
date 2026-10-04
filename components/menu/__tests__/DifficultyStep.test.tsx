import { DIFFICULTIES } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { DifficultyStep } from '../DifficultyStep';

const mockBankState = { current: { status: 'ready' } as Record<string, unknown> };
const mockIsOnline = { current: true };
const mockRetry = jest.fn();

jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [{ banks: { hard: { hash: 'b'.repeat(64), path: 'elixir/hard.json' } }, glyph: 'EX', grammar: 'plain', id: 'elixir', label: 'Elixir', tagline: 'Pipes.' }],
    schemaVersion: 2,
  }),
}));
jest.mock('../../../state/useQuestionBank', () => ({ useQuestionBank: () => mockBankState.current }));
jest.mock('../../../state/useIsOnline', () => ({ useIsOnline: () => mockIsOnline.current }));

describe('DifficultyStep', () => {
  beforeEach(() => {
    mockBankState.current = { bank: { hash: 'b'.repeat(64), questions: [] }, status: 'ready' };
    mockIsOnline.current = true;
  });

  it('lists only the difficulties the language has, with registry labels and descriptions', async () => {
    const onSelectDifficulty = jest.fn();
    await render(<DifficultyStep language="elixir" onSelectDifficulty={onSelectDifficulty} onBack={jest.fn()} />);
    expect(screen.getByText('Hard')).toBeTruthy();
    expect(screen.getByText(DIFFICULTIES[2].description)).toBeTruthy();
    expect(screen.queryByText('Easy')).toBeNull();
    await fireEvent.press(screen.getByText('Hard'));
    expect(onSelectDifficulty).toHaveBeenCalledWith('hard');
  });

  it('disables a difficulty with no copy while offline and labels it', async () => {
    mockBankState.current = { status: 'loading' };
    mockIsOnline.current = false;
    await render(<DifficultyStep language="elixir" onSelectDifficulty={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByText('Needs a connection to load')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Hard/ })).toBeDisabled();
  });

  it('retries a failed download when the card is pressed while online', async () => {
    mockBankState.current = { retry: mockRetry, status: 'error' };
    await render(<DifficultyStep language="elixir" onSelectDifficulty={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByText('Download failed. Tap to retry')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /Hard/ }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  // A locked paid bank opens the paywall (Task 3.18); see app/__tests__/difficultyPaywall.test.tsx.
});
