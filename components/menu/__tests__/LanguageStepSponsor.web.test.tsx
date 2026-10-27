// components/menu/__tests__/LanguageStepSponsor.web.test.tsx
// On the web the sponsored card sits outside the number-key order: keys 1 to 3 still select the first three
// tracks in display order, and only track cards carry key hints.
import type { LanguageEntry } from '@syntactical/content-schema';
import { act, render, screen } from '@testing-library/react';

import { LanguageStep } from '../LanguageStep';

jest.mock('../../sponsor/SponsoredCard', () => {
  const { Text } = require('react-native');
  return {
    SponsoredCard: ({ placement }: { placement: string }) => <Text>{`sponsored ${placement}`}</Text>,
  };
});

function buildEntry(id: string, label: string, category: 'frontend' | 'backend' | 'database'): LanguageEntry {
  return {
    banks: {},
    category,
    glyph: 'X',
    grammar: 'plain',
    id,
    label,
    misconceptions: [],
    tagline: `${label} tagline`,
    topics: [],
  };
}

const ENTRIES = [
  buildEntry('javascript', 'JavaScript', 'frontend'),
  buildEntry('python', 'Python', 'backend'),
  buildEntry('postgres', 'Postgres', 'database'),
];

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
}

describe('LanguageStep sponsored card on the web', () => {
  it('leaves the number keys on the tracks in display order', () => {
    const onSelectLanguage = jest.fn();
    render(<LanguageStep languages={ENTRIES} onSelectLanguage={onSelectLanguage} />);
    expect(screen.getByText('sponsored tracks')).toBeTruthy();
    pressKey('2');
    expect(onSelectLanguage).toHaveBeenLastCalledWith('python');
    pressKey('3');
    expect(onSelectLanguage).toHaveBeenLastCalledWith('postgres');
    expect(screen.queryByText('4')).toBeNull();
  });
});
