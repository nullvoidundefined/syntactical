import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Text } from 'react-native';

import { LengthStep } from '../LengthStep';

jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [{ banks: {}, glyph: 'PY', grammar: 'python', id: 'python', label: 'Python', tagline: 't', topics: [] }],
    schemaVersion: 2,
  }),
}));

function Harness({ poolSize }: { poolSize: number }) {
  const [selection, setSelection] = useState('nothing selected');
  return (
    <>
      <Text>{selection}</Text>
      <LengthStep
        language="python"
        difficulty="easy"
        poolSize={poolSize}
        onSelectLength={(count) => setSelection(`length ${count ?? 'all'}`)}
        onBack={() => setSelection('back to topics')}
      />
    </>
  );
}

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
}

describe('web keyboard navigation on the length step', () => {
  it('1, 2, and 3 pick 20, 50, and all questions', () => {
    render(<Harness poolSize={100} />);
    pressKey('1');
    expect(screen.queryByText('length 20')).not.toBeNull();
    pressKey('2');
    expect(screen.queryByText('length 50')).not.toBeNull();
    pressKey('3');
    expect(screen.queryByText('length all')).not.toBeNull();
  });

  it('with a pool of 30, 2 picks all questions and 3 selects nothing', () => {
    render(<Harness poolSize={30} />);
    pressKey('3');
    expect(screen.queryByText('nothing selected')).not.toBeNull();
    pressKey('2');
    expect(screen.queryByText('length all')).not.toBeNull();
  });

  it('Escape goes back', () => {
    render(<Harness poolSize={100} />);
    pressKey('Escape');
    expect(screen.queryByText('back to topics')).not.toBeNull();
  });
});
