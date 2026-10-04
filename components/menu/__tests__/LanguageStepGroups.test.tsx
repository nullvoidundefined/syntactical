import type { LanguageEntry } from '@syntactical/content-schema';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LanguageStep } from '../LanguageStep';

function buildEntry(id: string, label: string, kind?: 'language' | 'topic'): LanguageEntry {
  return {
    banks: {},
    glyph: 'X',
    grammar: 'plain',
    id,
    label,
    misconceptions: [],
    tagline: `${label} tagline`,
    topics: [],
    ...(kind ? { kind } : {}),
  };
}

describe('LanguageStep groups', () => {
  it('lists entries without kind under Languages and topic entries under Topics, in that order', async () => {
    await render(
      <LanguageStep
        languages={[buildEntry('backend-security', 'Backend Security', 'topic'), buildEntry('python', 'Python')]}
        onSelectLanguage={jest.fn()}
      />,
    );
    expect(screen.getAllByRole('heading').map((heading) => heading.props.children)).toEqual(['Languages', 'Topics']);
  });

  it("puts an explicit kind 'language' under Languages", async () => {
    await render(<LanguageStep languages={[buildEntry('go', 'Go', 'language')]} onSelectLanguage={jest.fn()} />);
    expect(screen.getAllByRole('heading').map((heading) => heading.props.children)).toEqual(['Languages']);
  });

  it('shows no Topics heading when no entry is a topic', async () => {
    await render(
      <LanguageStep
        languages={[buildEntry('python', 'Python'), buildEntry('postgres', 'Postgres')]}
        onSelectLanguage={jest.fn()}
      />,
    );
    expect(screen.queryByRole('heading', { name: 'Topics' })).toBeNull();
  });

  it('shows no Languages heading when every entry is a topic', async () => {
    await render(
      <LanguageStep
        languages={[buildEntry('backend-security', 'Backend Security', 'topic')]}
        onSelectLanguage={jest.fn()}
      />,
    );
    expect(screen.queryByRole('heading', { name: 'Languages' })).toBeNull();
    expect(screen.getAllByRole('heading').map((heading) => heading.props.children)).toEqual(['Topics']);
  });

  it('reports the id of a topic entry when pressed', async () => {
    const onSelectLanguage = jest.fn();
    await render(
      <LanguageStep
        languages={[buildEntry('python', 'Python'), buildEntry('backend-security', 'Backend Security', 'topic')]}
        onSelectLanguage={onSelectLanguage}
      />,
    );
    await fireEvent.press(screen.getByText('Backend Security'));
    expect(onSelectLanguage).toHaveBeenCalledWith('backend-security');
  });
});
