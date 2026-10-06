import type { LanguageEntry } from '@syntactical/content-schema';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Text } from 'react-native';

import { DifficultyStep } from '../DifficultyStep';
import { LanguageStep } from '../LanguageStep';
import { TopicStep } from '../TopicStep';

const mockBankStates: Record<string, Record<string, unknown>> = {};

jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    languages: [
      {
        banks: {
          easy: { hash: 'a'.repeat(64), path: 'python/easy.json', topicCounts: { numbers: 4, strings: 6 } },
          hard: { hash: 'b'.repeat(64), path: 'python/hard.json' },
        },
        glyph: 'PY',
        grammar: 'python',
        id: 'python',
        label: 'Python',
        tagline: 'Snakes.',
        topics: [
          { id: 'strings', label: 'Strings' },
          { id: 'numbers', label: 'Numbers' },
        ],
      },
    ],
    schemaVersion: 2,
  }),
}));
jest.mock('../../../state/useQuestionBank', () => ({
  useQuestionBank: (_language: string, difficulty: string) => mockBankStates[difficulty],
}));
jest.mock('../../../state/useIsOnline', () => ({ useIsOnline: () => false }));

const languages: LanguageEntry[] = [
  {
    banks: {},
    glyph: 'PY',
    grammar: 'python',
    id: 'python',
    label: 'Python',
    misconceptions: [],
    tagline: 'Snakes.',
    topics: [],
  },
  {
    banks: {},
    glyph: 'PG',
    grammar: 'sql',
    id: 'postgres',
    label: 'Postgres',
    misconceptions: [],
    tagline: 'Tables.',
    topics: [],
  },
];

function MenuHarness() {
  const [selection, setSelection] = useState('nothing selected');
  return (
    <>
      <Text>{selection}</Text>
      <LanguageStep languages={languages} onSelectLanguage={(id) => setSelection(`language ${id}`)} />
    </>
  );
}

function DifficultyHarness() {
  const [selection, setSelection] = useState('nothing selected');
  return (
    <>
      <Text>{selection}</Text>
      <DifficultyStep
        language="python"
        onSelectDifficulty={(id) => setSelection(`difficulty ${id}`)}
        onBack={() => setSelection('back to languages')}
      />
    </>
  );
}

function TopicHarness() {
  const [selection, setSelection] = useState('nothing selected');
  return (
    <>
      <Text>{selection}</Text>
      <TopicStep
        language="python"
        difficulty="easy"
        onSelectLength={(count) => setSelection(`length ${count ?? 'all'}`)}
        onSelectTopic={(topic) => setSelection(`topic ${topic}`)}
        onBack={() => setSelection('back to difficulties')}
      />
    </>
  );
}

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
}

describe('web keyboard navigation in the menus', () => {
  beforeEach(() => {
    mockBankStates.easy = { bank: { hash: 'a'.repeat(64), questions: [] }, status: 'ready' };
    mockBankStates.hard = { status: 'loading' };
  });

  it('a number key selects the language with that key hint', () => {
    render(<MenuHarness />);
    pressKey('2');
    expect(screen.queryByText('language postgres')).not.toBeNull();
  });

  it('a number key past the list selects nothing, and a listed one still works after it', () => {
    render(<MenuHarness />);
    pressKey('3');
    expect(screen.queryByText('nothing selected')).not.toBeNull();
    pressKey('1');
    expect(screen.queryByText('language python')).not.toBeNull();
  });

  it('a number key selects an available difficulty', () => {
    render(<DifficultyHarness />);
    pressKey('1');
    expect(screen.queryByText('difficulty easy')).not.toBeNull();
  });

  it('a number key does not select a disabled difficulty, and an available one still works after it', () => {
    render(<DifficultyHarness />);
    pressKey('2');
    expect(screen.queryByText('nothing selected')).not.toBeNull();
    pressKey('1');
    expect(screen.queryByText('difficulty easy')).not.toBeNull();
  });

  it('Escape goes back from the difficulty step', () => {
    render(<DifficultyHarness />);
    pressKey('Escape');
    expect(screen.queryByText('back to languages')).not.toBeNull();
  });

  it('on the topic step, 1 picks all questions (the bank holds 10) and 2 and 3 the topics', () => {
    render(<TopicHarness />);
    pressKey('1');
    expect(screen.queryByText('length all')).not.toBeNull();
    pressKey('2');
    expect(screen.queryByText('topic strings')).not.toBeNull();
    pressKey('3');
    expect(screen.queryByText('topic numbers')).not.toBeNull();
  });

  it('on the topic step, a key past the list selects nothing and Escape goes back', () => {
    render(<TopicHarness />);
    pressKey('4');
    expect(screen.queryByText('nothing selected')).not.toBeNull();
    pressKey('Escape');
    expect(screen.queryByText('back to difficulties')).not.toBeNull();
  });
});
