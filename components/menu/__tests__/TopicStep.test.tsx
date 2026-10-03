import { fireEvent, render, screen } from '@testing-library/react-native';

import { TopicStep } from '../TopicStep';

jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [
      {
        banks: {
          easy: { hash: 'a'.repeat(64), path: 'python/easy.json', topicCounts: { numbers: 1, strings: 10 } },
          hard: { hash: 'b'.repeat(64), path: 'python/hard.json', topicCounts: {} },
        },
        glyph: 'PY',
        grammar: 'python',
        id: 'python',
        label: 'Python',
        tagline: 't',
        topics: [
          { id: 'strings', label: 'Strings' },
          { id: 'numbers', label: 'Numbers' },
          { id: 'wtf', label: 'WTF' },
        ],
      },
    ],
    schemaVersion: 2,
  }),
}));

describe('TopicStep', () => {
  it('lists topics from the manifest with counts, skipping a topic the bank has no questions for', async () => {
    await render(<TopicStep language="python" difficulty="easy" onSelectTopic={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Whole bank/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Strings, 10 questions/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Numbers, 1 question$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /WTF/ })).toBeNull();
  });

  it('offers only the whole bank when the manifest has no topic counts for it', async () => {
    await render(<TopicStep language="python" difficulty="hard" onSelectTopic={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getAllByRole('button', { name: /Whole bank|Strings/ })).toHaveLength(1);
  });

  it('reports the chosen topic, or undefined for the whole bank', async () => {
    const onSelectTopic = jest.fn();
    await render(<TopicStep language="python" difficulty="easy" onSelectTopic={onSelectTopic} onBack={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: /Strings, 10 questions/ }));
    await fireEvent.press(screen.getByRole('button', { name: /Whole bank/ }));
    expect(onSelectTopic.mock.calls).toEqual([['strings'], [undefined]]);
  });

  it('has one level-1 heading naming the language and difficulty, and a Back button', async () => {
    const onBack = jest.fn();
    await render(<TopicStep language="python" difficulty="easy" onSelectTopic={jest.fn()} onBack={onBack} />);
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: /Select topic.*Python Easy/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
