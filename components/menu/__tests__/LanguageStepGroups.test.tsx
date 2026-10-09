import type { LanguageEntry } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LanguageStep } from '../LanguageStep';

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

function readHeadings() {
  return screen.getAllByRole('heading').map((heading) => heading.props.children);
}

describe('LanguageStep groups', () => {
  it('shows Frontend, Backend and Database in that order whatever the manifest order', async () => {
    await render(
      <LanguageStep
        languages={[
          buildEntry('postgres', 'Postgres', 'database'),
          buildEntry('python', 'Python', 'backend'),
          buildEntry('javascript', 'JavaScript', 'frontend'),
        ]}
        onSelectLanguage={jest.fn()}
      />,
    );
    expect(readHeadings()).toEqual(['Frontend', 'Backend', 'Database']);
  });

  it('puts entries under their category in manifest order', async () => {
    await render(
      <LanguageStep
        languages={[
          buildEntry('python', 'Python', 'backend'),
          buildEntry('javascript', 'JavaScript', 'frontend'),
          buildEntry('go', 'Go', 'backend'),
        ]}
        onSelectLanguage={jest.fn()}
      />,
    );
    const titles = screen.getAllByText(/^(Python|JavaScript|Go)$/).map((node) => node.props.children);
    expect(titles).toEqual(['JavaScript', 'Python', 'Go']);
  });

  it('lists an uncategorized entry in a last group headed More', async () => {
    await render(
      <LanguageStep
        languages={[buildEntry('mystery', 'Mystery'), buildEntry('postgres', 'Postgres', 'database')]}
        onSelectLanguage={jest.fn()}
      />,
    );
    expect(readHeadings()).toEqual(['Database', 'More']);
  });

  it('hides empty groups and the old Languages and Topics headings', async () => {
    await render(<LanguageStep languages={[buildEntry('go', 'Go', 'backend')]} onSelectLanguage={jest.fn()} />);
    expect(readHeadings()).toEqual(['Backend']);
    expect(screen.queryByText('Languages')).toBeNull();
    expect(screen.queryByText('Topics')).toBeNull();
  });

  it('reports the id of a pressed entry', async () => {
    const onSelectLanguage = jest.fn();
    await render(
      <LanguageStep
        languages={[buildEntry('python', 'Python', 'backend'), buildEntry('postgres', 'Postgres', 'database')]}
        onSelectLanguage={onSelectLanguage}
      />,
    );
    await fireEvent.press(screen.getByText('Postgres'));
    expect(onSelectLanguage).toHaveBeenCalledWith('postgres');
  });
});
