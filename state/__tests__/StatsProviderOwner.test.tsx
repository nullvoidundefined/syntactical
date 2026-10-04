import { randomUUID } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CachedBank, Question } from '@syntactical/content-schema';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { WeaknessReport } from '../../components/stats/WeaknessReport';
import { EVENT_LOG_STORAGE_KEY } from '../../constants/appConfig';
import type { LoggedAnswerEvent } from '../../services/stats/types/LoggedAnswerEvent';
import { StatsProvider, useQuizStats } from '../StatsProvider';
import { useReviewQueue } from '../useReviewQueue';

const GUEST_MISCONCEPTION = 'python.mutable-default-args';
const USER_MISCONCEPTION = 'python.late-binding-closures';
const GUEST_DESCRIPTION = 'Mutable default arguments are shared';
const USER_DESCRIPTION = 'Closures bind loop variables late';
const DAY_MS = 86_400_000;
const SEEDED_PER_OWNER = 20;

function buildQuestion(id: string, misconceptionId: string): Question {
  return {
    answerIndex: 0,
    choices: [{ text: 'right' }, { misconceptionId, text: 'wrong' }],
    id,
    prompt: 'p',
    provenance: { isHumanReviewed: false, source: 'original', validation: { method: 'judged', status: 'pending' } },
    query: { explanation: 'e', title: 't' },
    type: 'mc',
  };
}

const bank: CachedBank = {
  hash: 'a'.repeat(64),
  questions: [buildQuestion('py-easy-01', GUEST_MISCONCEPTION), buildQuestion('py-easy-02', USER_MISCONCEPTION)],
};
const mockReadLocalBank = (language: string, difficulty: string) => (language === 'python' && difficulty === 'easy' ? bank : null);
const mockManifest = {
  languages: [
    {
      misconceptions: [
        { description: GUEST_DESCRIPTION, id: GUEST_MISCONCEPTION },
        { description: USER_DESCRIPTION, id: USER_MISCONCEPTION },
      ],
    },
  ],
};

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../ContentProvider', () => ({
  useContentContext: () => ({ baselineManifest: mockManifest, contentBaseUrl: null, readLocalBank: mockReadLocalBank }),
}));
jest.mock('../useLanguageManifest', () => ({ useLanguageManifest: () => mockManifest }));

// Misses two days ago, one minute apart: inside the weekly window, and each
// missed question is due for review by now.
function buildMisses(ownerUserId: string | null, questionId: string): LoggedAnswerEvent[] {
  const start = Date.now() - 2 * DAY_MS;
  return Array.from({ length: SEEDED_PER_OWNER }, (_unused, index) => ({
    answeredAt: new Date(start + index * 60_000).toISOString(),
    bankKey: 'python/easy',
    choiceIndex: 1,
    eventId: randomUUID(),
    isCorrect: false,
    isHeld: false,
    isSynced: ownerUserId !== null,
    ownerUserId,
    questionId,
    roundKind: 'bank',
  }));
}

function OwnerProbe() {
  const { eventLog, isHydrated, recordAnswer } = useQuizStats();
  const { dueQuestions } = useReviewQueue();
  const owners = [...new Set(eventLog.map(({ ownerUserId }) => ownerUserId ?? 'guest'))].sort();
  const dueIds = dueQuestions.map(({ question: { id } }) => id).sort();
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="events">{eventLog.length}</Text>
      <Text testID="owners">{owners.join(',')}</Text>
      <Text testID="due">{dueIds.join(',')}</Text>
      <Pressable
        testID="answer"
        onPress={() =>
          recordAnswer({ choiceIndex: 0, difficulty: 'easy', language: 'python', questionId: 'py-easy-01', roundKind: 'bank', wasCorrect: true })
        }
      />
      <WeaknessReport />
    </>
  );
}

async function readStoredLog(): Promise<LoggedAnswerEvent[]> {
  return JSON.parse((await AsyncStorage.getItem(EVENT_LOG_STORAGE_KEY)) ?? '[]');
}

async function renderHydrated(ownerUserId: string | null) {
  const view = await render(<StatsProvider ownerUserId={ownerUserId}><OwnerProbe /></StatsProvider>);
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  return view;
}

function weakSpotLinkName(description: string): string {
  return `Review ${description}, missed ${SEEDED_PER_OWNER} of ${SEEDED_PER_OWNER}`;
}

describe('StatsProvider owner-scoped event log', () => {
  const otherUserId = randomUUID();
  let guestEvents: LoggedAnswerEvent[];
  let otherUserEvents: LoggedAnswerEvent[];

  beforeEach(async () => {
    await AsyncStorage.clear();
    guestEvents = buildMisses(null, 'py-easy-01');
    otherUserEvents = buildMisses(otherUserId, 'py-easy-02');
    await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify([...otherUserEvents, ...guestEvents]));
  });

  it('shows a guest only guest events in the event log, the review queue, and the weakness report', async () => {
    await renderHydrated(null);
    expect(screen.getByTestId('events')).toHaveTextContent(String(SEEDED_PER_OWNER));
    expect(screen.getByTestId('owners')).toHaveTextContent('guest');
    expect(screen.getByTestId('due')).toHaveTextContent('py-easy-01');
    expect(screen.getByTestId('due')).not.toHaveTextContent('py-easy-02');
    expect(screen.queryByRole('link', { name: weakSpotLinkName(GUEST_DESCRIPTION) })).not.toBeNull();
    expect(screen.queryByRole('link', { name: weakSpotLinkName(USER_DESCRIPTION) })).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(1);
  });

  it('shows a signed-in user only that user\'s events in the event log, the review queue, and the weakness report', async () => {
    await renderHydrated(otherUserId);
    expect(screen.getByTestId('events')).toHaveTextContent(String(SEEDED_PER_OWNER));
    expect(screen.getByTestId('owners')).toHaveTextContent(otherUserId);
    expect(screen.getByTestId('owners')).not.toHaveTextContent('guest');
    expect(screen.getByTestId('due')).toHaveTextContent('py-easy-02');
    expect(screen.getByTestId('due')).not.toHaveTextContent('py-easy-01');
    expect(screen.queryByRole('link', { name: weakSpotLinkName(USER_DESCRIPTION) })).not.toBeNull();
    expect(screen.queryByRole('link', { name: weakSpotLinkName(GUEST_DESCRIPTION) })).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(1);
  });

  it('keeps every owner\'s entries in the stored log when a guest records an answer', async () => {
    await renderHydrated(null);
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(2 * SEEDED_PER_OWNER + 1));
    const stored = await readStoredLog();
    expect(stored.slice(0, 2 * SEEDED_PER_OWNER)).toEqual([...otherUserEvents, ...guestEvents]);
    expect(stored[2 * SEEDED_PER_OWNER].ownerUserId).toBeNull();
    expect(screen.getByTestId('events')).toHaveTextContent(String(SEEDED_PER_OWNER + 1));
    expect(screen.getByTestId('owners')).toHaveTextContent('guest');
  });

  it('stamps an answer recorded while signed in with that user and shows it only to that user', async () => {
    const view = await renderHydrated(otherUserId);
    await fireEvent.press(screen.getByTestId('answer'));
    await waitFor(async () => expect(await readStoredLog()).toHaveLength(2 * SEEDED_PER_OWNER + 1));
    const stored = await readStoredLog();
    expect(stored[2 * SEEDED_PER_OWNER].ownerUserId).toBe(otherUserId);
    expect(stored.slice(0, 2 * SEEDED_PER_OWNER)).toEqual([...otherUserEvents, ...guestEvents]);
    expect(screen.getByTestId('events')).toHaveTextContent(String(SEEDED_PER_OWNER + 1));
    await view.rerender(<StatsProvider ownerUserId={null}><OwnerProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('owners')).toHaveTextContent('guest'));
    expect(screen.getByTestId('events')).toHaveTextContent(String(SEEDED_PER_OWNER));
  });
});
