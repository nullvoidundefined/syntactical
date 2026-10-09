// On the web the grouped language step has no axe violations (the rule engine Lighthouse uses),
// its headings sit at level 2 under the page h1, and number keys follow the display order.
// color-contrast is disabled because jsdom computes no colors; the Lighthouse run covers it.
import type { LanguageEntry } from '@syntactical/content-schema';
import { act, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Text } from 'react-native';

import { LanguageStep } from '../LanguageStep';

expect.extend(toHaveNoViolations);

function buildEntry(id: string, label: string, category?: 'frontend' | 'backend' | 'database'): LanguageEntry {
  return {
    banks: {},
    glyph: 'X',
    grammar: 'plain',
    id,
    label,
    misconceptions: [],
    tagline: `${label} tagline`,
    topics: [],
    ...(category ? { category } : {}),
  };
}

const ENTRIES = [
  buildEntry('postgres', 'Postgres', 'database'),
  buildEntry('python', 'Python', 'backend'),
  buildEntry('javascript', 'JavaScript', 'frontend'),
  buildEntry('mystery', 'Mystery'),
];

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
}

describe('LanguageStep groups on the web', () => {
  it('has no axe violations and level-2 headings under the page h1', async () => {
    const { container } = render(
      <>
        <Text role="heading" aria-level={1}>
          syntactical
        </Text>
        <LanguageStep languages={ENTRIES} onSelectLanguage={jest.fn()} />
      </>,
    );
    const levels = [...container.querySelectorAll('[role="heading"]')].map((node) => node.getAttribute('aria-level'));
    expect(levels).toEqual(['1', '2', '2', '2', '2']);
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations();
  });

  it('maps number keys to the displayed order: Frontend, Backend, Database, then More', () => {
    const onSelectLanguage = jest.fn();
    render(<LanguageStep languages={ENTRIES} onSelectLanguage={onSelectLanguage} />);
    pressKey('1');
    expect(onSelectLanguage).toHaveBeenLastCalledWith('javascript');
    pressKey('2');
    expect(onSelectLanguage).toHaveBeenLastCalledWith('python');
    pressKey('3');
    expect(onSelectLanguage).toHaveBeenLastCalledWith('postgres');
    pressKey('4');
    expect(onSelectLanguage).toHaveBeenLastCalledWith('mystery');
    expect(screen.getByText('More')).toBeTruthy();
  });
});
