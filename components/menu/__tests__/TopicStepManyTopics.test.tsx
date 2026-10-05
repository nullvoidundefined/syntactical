import { fireEvent, render, screen } from '@testing-library/react-native';

import { TopicStep } from '../TopicStep';

jest.mock('../../../state/useLanguageManifest', () => {
  const ids = ['t1', 't2', 't3', 't4', 't5', 't6'];
  return {
    useLanguageManifest: () => ({
      languages: [
        {
          banks: {
            easy: {
              hash: 'a'.repeat(64),
              path: 'python/easy.json',
              topicCounts: Object.fromEntries(ids.map((id) => [id, 2])),
            },
          },
          glyph: 'PY',
          grammar: 'python',
          id: 'python',
          label: 'Python',
          tagline: 't',
          topics: ids.map((id) => ({ id, label: `Topic ${id}` })),
        },
      ],
      schemaVersion: 2,
    }),
  };
});

// Hints are aria-hidden, so look them up by their text node among all rendered text.
function hasHint(hint: string): boolean {
  return screen.queryAllByText(hint, { includeHiddenElements: true }).length > 0;
}

describe('TopicStep with more topics than bound keys', () => {
  it('hints only the items a bound key reaches, and keeps the rest pressable', async () => {
    const onSelectTopic = jest.fn();
    await render(
      <TopicStep
        language="python"
        difficulty="easy"
        onSelectLength={jest.fn()}
        onSelectTopic={onSelectTopic}
        onBack={jest.fn()}
      />,
    );
    ['1', '2', '3', '4'].forEach((hint) => expect(hasHint(hint)).toBe(true));
    ['5', '6', '7'].forEach((hint) => expect(hasHint(hint)).toBe(false));
    await fireEvent.press(screen.getByRole('button', { name: /Topic t6, 2 questions/ }));
    expect(onSelectTopic).toHaveBeenCalledWith('t6');
  });
});
