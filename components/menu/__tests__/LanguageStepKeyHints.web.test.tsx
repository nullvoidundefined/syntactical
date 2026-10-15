// Only four choice keys exist (1-4, mirrored by A-D), so the language step may promise a number
// key only on the cards a key can select. With twelve tracks, hints 5+ used to show and did
// nothing when pressed.
import type { LanguageEntry } from '@syntactical/content-schema';
import { act, render, screen } from '@testing-library/react';

import { LanguageStep } from '../LanguageStep';

function buildEntry(id: string, label: string, category: 'frontend' | 'backend' | 'database'): LanguageEntry {
  return {
    banks: {},
    glyph: 'X',
    grammar: 'plain',
    id,
    label,
    misconceptions: [],
    tagline: `${label} tagline`,
    topics: [],
    category,
  };
}

const ENTRIES = [
  buildEntry('javascript', 'JavaScript', 'frontend'),
  buildEntry('typescript', 'TypeScript', 'frontend'),
  buildEntry('typescript-types', 'TypeScript Types', 'frontend'),
  buildEntry('frontend-security', 'Frontend Security', 'frontend'),
  buildEntry('python', 'Python', 'backend'),
  buildEntry('postgres', 'Postgres', 'database'),
];

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
}

describe('LanguageStep key hints', () => {
  it('shows number hints only on the first four cards', () => {
    render(<LanguageStep languages={ENTRIES} onSelectLanguage={jest.fn()} />);
    for (const hint of ['1', '2', '3', '4']) expect(screen.queryByText(hint)).not.toBeNull();
    expect(screen.queryByText('5')).toBeNull();
    expect(screen.queryByText('6')).toBeNull();
  });

  it('selects nothing for a key with no card behind it', () => {
    const onSelectLanguage = jest.fn();
    render(<LanguageStep languages={ENTRIES} onSelectLanguage={onSelectLanguage} />);
    pressKey('5');
    expect(onSelectLanguage).not.toHaveBeenCalled();
    pressKey('4');
    expect(onSelectLanguage).toHaveBeenLastCalledWith('frontend-security');
  });
});
