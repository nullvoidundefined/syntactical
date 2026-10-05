import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Text } from 'react-native';

import { TopicStep } from '../TopicStep';

// Easy holds 100 questions (three length cards), hard holds 15 (one length card).
jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [
      {
        banks: {
          easy: { hash: 'a'.repeat(64), path: 'python/easy.json', topicCounts: { numbers: 40, strings: 60 } },
          hard: { hash: 'b'.repeat(64), path: 'python/hard.json', topicCounts: { numbers: 5, strings: 10 } },
        },
        glyph: 'PY',
        grammar: 'python',
        id: 'python',
        label: 'Python',
        tagline: 't',
        topics: [
          { id: 'strings', label: 'Strings' },
          { id: 'numbers', label: 'Numbers' },
        ],
      },
    ],
    schemaVersion: 2,
  }),
}));

function Harness({ difficulty }: { difficulty: string }) {
  const [selection, setSelection] = useState('nothing selected');
  return (
    <>
      <Text>{selection}</Text>
      <TopicStep
        language="python"
        difficulty={difficulty}
        onSelectLength={(count) => setSelection(`length ${count ?? 'all'}`)}
        onSelectTopic={(topic) => setSelection(`topic ${topic}`)}
        onBack={() => setSelection('back')}
      />
    </>
  );
}

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
}

describe('TopicStep keys', () => {
  it('maps 1, 2, 3 to the length cards, then 4 and up to the topics', () => {
    render(<Harness difficulty="easy" />);
    ['1', '2', '3', '4'].forEach((key, index) => {
      pressKey(key);
      expect(screen.queryByText(['length 20', 'length 50', 'length all', 'topic strings'][index])).not.toBeNull();
    });
  });

  it('starts the topics at the next key when fewer length cards show', () => {
    render(<Harness difficulty="hard" />);
    pressKey('1');
    expect(screen.queryByText('length all')).not.toBeNull();
    pressKey('2');
    expect(screen.queryByText('topic strings')).not.toBeNull();
    pressKey('3');
    expect(screen.queryByText('topic numbers')).not.toBeNull();
  });

  it('hints only the bound positions and Escape goes back', () => {
    render(<Harness difficulty="easy" />);
    ['1', '2', '3', '4'].forEach((hint) => expect(screen.queryAllByText(hint).length).toBeGreaterThan(0));
    expect(screen.queryAllByText('5')).toHaveLength(0);
    pressKey('Escape');
    expect(screen.queryByText('back')).not.toBeNull();
  });
});
