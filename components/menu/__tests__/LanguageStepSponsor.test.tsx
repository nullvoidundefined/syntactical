// components/menu/__tests__/LanguageStepSponsor.test.tsx
// The track list shows one sponsored card between its category groups (after the first group), and after
// the only group when there is one. Whether the user may see it is the card's own decision (Task 6.4).
import type { LanguageEntry } from '@syntactical/content-schema';
import { render, screen } from '@testing-library/react-native';

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

describe('LanguageStep sponsored card', () => {
  it('places one card after the first group and before the second heading', async () => {
    await render(<LanguageStep languages={ENTRIES} onSelectLanguage={jest.fn()} />);
    expect(screen.getAllByText('sponsored tracks')).toHaveLength(1);
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('JavaScript')).toBeLessThan(tree.indexOf('sponsored tracks'));
    expect(tree.indexOf('sponsored tracks')).toBeLessThan(tree.indexOf('Backend'));
  });

  it('places the card after the only group', async () => {
    await render(<LanguageStep languages={[ENTRIES[1]]} onSelectLanguage={jest.fn()} />);
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Python')).toBeLessThan(tree.indexOf('sponsored tracks'));
  });
});
