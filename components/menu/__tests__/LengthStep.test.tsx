import { fireEvent, render, screen } from '@testing-library/react-native';

import { LengthStep } from '../LengthStep';

jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [{ banks: {}, glyph: 'PY', grammar: 'python', id: 'python', label: 'Python', tagline: 't', topics: [] }],
    schemaVersion: 2,
  }),
}));

// Hints are aria-hidden, so look them up by their text node among all rendered text.
function hasHint(hint: string): boolean {
  return screen.queryAllByText(hint, { includeHiddenElements: true }).length > 0;
}

describe('LengthStep', () => {
  it('offers 20, 50, and all questions for a pool of 100', async () => {
    await render(
      <LengthStep language="python" difficulty="easy" poolSize={100} onSelectLength={jest.fn()} onBack={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: /20 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /50 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /All 100 questions/ })).toBeTruthy();
    ['1', '2', '3'].forEach((hint) => expect(hasHint(hint)).toBe(true));
  });

  it('offers only 20 and all questions for a pool of 30', async () => {
    await render(
      <LengthStep language="python" difficulty="easy" poolSize={30} onSelectLength={jest.fn()} onBack={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: /20 questions/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /50 questions/ })).toBeNull();
    expect(screen.getByRole('button', { name: /All 30 questions/ })).toBeTruthy();
    expect(hasHint('3')).toBe(false);
  });

  it('offers 20, 50, and "All questions" with no count when the pool size is unknown', async () => {
    const onSelectLength = jest.fn();
    await render(
      <LengthStep
        language="python"
        difficulty="easy"
        poolSize={undefined}
        onSelectLength={onSelectLength}
        onBack={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /20 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /50 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^All questions/ })).toBeTruthy();
    expect(screen.queryByText(/of undefined/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^All questions/ }));
    expect(onSelectLength).toHaveBeenCalledWith(undefined);
  });

  it('reports the chosen length, or undefined for all questions', async () => {
    const onSelectLength = jest.fn();
    await render(
      <LengthStep
        language="python"
        difficulty="easy"
        poolSize={100}
        onSelectLength={onSelectLength}
        onBack={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: /20 questions/ }));
    await fireEvent.press(screen.getByRole('button', { name: /50 questions/ }));
    await fireEvent.press(screen.getByRole('button', { name: /All 100 questions/ }));
    expect(onSelectLength.mock.calls).toEqual([[20], [50], [undefined]]);
  });

  it('has one level-1 heading naming the language and difficulty, and a Back button', async () => {
    const onBack = jest.fn();
    await render(
      <LengthStep language="python" difficulty="easy" poolSize={100} onSelectLength={jest.fn()} onBack={onBack} />,
    );
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: /Select length.*Python Easy/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
