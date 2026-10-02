import { DIFFICULTIES } from '@syntactical/content-schema';
import type { LanguageEntry } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LanguageStep } from '../LanguageStep';
import { SelectionCard } from '../SelectionCard';

const languages: LanguageEntry[] = [
  { banks: { easy: { hash: 'a'.repeat(64), path: 'python/easy.json' } }, glyph: 'PY', grammar: 'python', id: 'python', label: 'Python', tagline: 'Sharp edges.' },
  { banks: { hard: { hash: 'b'.repeat(64), path: 'elixir/hard.json' } }, glyph: 'EX', grammar: 'plain', id: 'elixir', label: 'Elixir', tagline: 'Pipes.' },
];

describe('menu', () => {
  it('lists every language in the manifest and reports the chosen id', async () => {
    const onSelectLanguage = jest.fn();
    await render(<LanguageStep languages={languages} onSelectLanguage={onSelectLanguage} />);
    expect(screen.getByText('Python')).toBeTruthy();
    await fireEvent.press(screen.getByText('Elixir'));
    expect(onSelectLanguage).toHaveBeenCalledWith('elixir');
  });

  it('labels and disables a difficulty that needs a connection', async () => {
    const onSelect = jest.fn();
    await render(
      <SelectionCard keyHint={1} title="Hard" subtitle={DIFFICULTIES[2].description} onSelect={onSelect} isDisabled statusLabel="Needs a connection to load" />,
    );
    expect(screen.getByText('Needs a connection to load')).toBeTruthy();
    await fireEvent.press(screen.getByText('Hard'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
