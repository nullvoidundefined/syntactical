// Round analytics (B-45): a real QuizRound over the real StatsProvider fires
// round_started on mount, round_completed (or review_round_completed) once at
// the end, and bank_exhausted once when this round's answers leave every
// question of the bank answered at least once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Question } from '@syntactical/content-schema';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { EVENT_LOG_STORAGE_KEY } from '../../../constants/appConfig';
import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';
import { StatsProvider, useQuizStats } from '../../../state/StatsProvider';
import type { RoundKind } from '../../../state/useQuizEngine';
import { QuizRound } from '../QuizRound';

const mockTrackEvent = jest.fn();
jest.mock('../../../clients/analyticsClient', () => ({
    identifyAnalyticsUser: jest.fn(),
    resetAnalyticsUser: jest.fn(),
    trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
jest.mock('../../auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

const query = { explanation: 'Because', title: 'Why' };
function boolQuestion(id: string): Question {
    return {
        answer: true,
        id,
        prompt: `Is ${id}?`,
        query,
        provenance: TEST_PROVENANCE,
        type: 'bool',
    };
}
const twoQuestions = [boolQuestion('q-1'), boolQuestion('q-2')];

function AfterHydration({ children }: { children: ReactNode }) {
    const { isHydrated } = useQuizStats();
    return isHydrated ? children : null;
}

async function renderRound(questions: Question[], roundKind: RoundKind = 'bank') {
    await render(
        <StatsProvider>
            <AfterHydration>
                <QuizRound
                    language="python"
                    languageLabel="Python"
                    difficulty="easy"
                    difficultyLabel="Easy"
                    grammar="python"
                    questions={questions}
                    roundKind={roundKind}
                    onExit={() => undefined}
                    onRetry={() => undefined}
                />
            </AfterHydration>
        </StatsProvider>,
    );
    await waitFor(() => expect(screen.queryByText('True')).not.toBeNull());
}

async function answerAll(count: number) {
    for (let index = 0; index < count; index += 1) {
        await fireEvent.press(screen.getByText('True'));
        await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    }
}

function callsNamed(name: string): unknown[][] {
    return mockTrackEvent.mock.calls.filter(([called]) => called === name);
}

beforeEach(() => AsyncStorage.clear());

describe('round analytics', () => {
    it('fires round_started exactly once on mount, with the bank and no question text', async () => {
        await renderRound(twoQuestions);
        expect(callsNamed('round_started')).toEqual([
            [
                'round_started',
                { difficulty: 'easy', language: 'python', roundKind: 'bank', totalQuestions: 2 },
            ],
        ]);
        await answerAll(1);
        expect(callsNamed('round_started')).toHaveLength(1);
    });

    it('fires round_completed exactly once, only when the last question is advanced', async () => {
        await renderRound(twoQuestions);
        await answerAll(1);
        expect(callsNamed('round_completed')).toHaveLength(0);
        await answerAll(1);
        await waitFor(() => expect(callsNamed('round_completed')).toHaveLength(1));
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(callsNamed('round_completed')).toEqual([
            [
                'round_completed',
                {
                    correctCount: 2,
                    difficulty: 'easy',
                    language: 'python',
                    roundKind: 'bank',
                    totalQuestions: 2,
                },
            ],
        ]);
        expect(callsNamed('review_round_completed')).toHaveLength(0);
    });

    it('fires review_round_completed, not round_completed, for a review round, with no bank properties', async () => {
        await renderRound([boolQuestion('q-1')], 'review');
        await answerAll(1);
        await waitFor(() => expect(callsNamed('review_round_completed')).toHaveLength(1));
        expect(callsNamed('review_round_completed')[0]).toEqual([
            'review_round_completed',
            { correctCount: 1, roundKind: 'review', totalQuestions: 1 },
        ]);
        expect(callsNamed('round_completed')).toHaveLength(0);
        expect(callsNamed('bank_exhausted')).toHaveLength(0);
    });

    it('fires no completion for a round with no questions', async () => {
        await render(
            <StatsProvider>
                <AfterHydration>
                    <QuizRound
                        language="python"
                        languageLabel="Python"
                        difficulty="easy"
                        difficultyLabel="Easy"
                        grammar="python"
                        questions={[]}
                        onExit={() => undefined}
                        onRetry={() => undefined}
                    />
                </AfterHydration>
            </StatsProvider>,
        );
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(callsNamed('round_completed')).toHaveLength(0);
    });

    it('fires bank_exhausted once, on the answer that leaves no question unanswered', async () => {
        await renderRound(twoQuestions);
        await fireEvent.press(screen.getByText('True'));
        await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
        expect(callsNamed('bank_exhausted')).toHaveLength(0);
        await fireEvent.press(screen.getByText('True'));
        await waitFor(() => expect(callsNamed('bank_exhausted')).toHaveLength(1));
        expect(callsNamed('bank_exhausted')[0]).toEqual([
            'bank_exhausted',
            { difficulty: 'easy', language: 'python', totalQuestions: 2 },
        ]);
        await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(callsNamed('bank_exhausted')).toHaveLength(1);
    });

    it('does not fire bank_exhausted while a question of the bank has never been answered', async () => {
        await renderRound([boolQuestion('q-1'), boolQuestion('q-2'), boolQuestion('q-3')]);
        await answerAll(2);
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(callsNamed('bank_exhausted')).toHaveLength(0);
    });

    it('does not fire bank_exhausted again in a round that starts with the bank already exhausted', async () => {
        const answered = twoQuestions.map((question, index) => ({
            answeredAt: `2026-10-0${index + 1}T10:00:00.000Z`,
            bankKey: 'python/easy',
            choiceIndex: 0,
            eventId: `00000000-0000-4000-8000-00000000000${index}`,
            isCorrect: true,
            isHeld: false,
            isSynced: false,
            ownerUserId: null,
            questionId: question.id,
            roundKind: 'bank',
        }));
        await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(answered));
        await renderRound(twoQuestions);
        await answerAll(2);
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(callsNamed('bank_exhausted')).toHaveLength(0);
    });

    it('counts only answers from the same bank toward exhaustion', async () => {
        const otherBank = twoQuestions.map((question, index) => ({
            answeredAt: `2026-10-0${index + 1}T10:00:00.000Z`,
            bankKey: 'python/hard',
            choiceIndex: 0,
            eventId: `00000000-0000-4000-8000-00000000001${index}`,
            isCorrect: true,
            isHeld: false,
            isSynced: false,
            ownerUserId: null,
            questionId: question.id,
            roundKind: 'bank',
        }));
        await AsyncStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(otherBank));
        await renderRound(twoQuestions);
        await fireEvent.press(screen.getByText('True'));
        await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(callsNamed('bank_exhausted')).toHaveLength(0);
    });
});
