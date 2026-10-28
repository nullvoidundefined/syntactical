// "This week's study note" on the home screen, for a signed-in user: a short paragraph written
// from their last 7 days of synced answers, or how many more answers it needs. Shows nothing for
// a guest, while loading, or when no note is available. A note whose week named misconceptions
// offers "Practice these", a review round of those that have questions on the device; it is
// hidden when none has (their banks are not on the device).
import { useMemo } from 'react';

import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { listMisconceptionQuestions } from '../../services/review/listMisconceptionQuestions';
import { useReviewQueue } from '../../state/useReviewQueue';
import { useStudyNote } from '../../state/useStudyNote';

function PracticeLink({ misconceptionIds }: { misconceptionIds: string[] }) {
  const { questionIndex } = useReviewQueue();
  const playable = useMemo(
    () => misconceptionIds.filter((id) => listMisconceptionQuestions(questionIndex, id).length > 0),
    [misconceptionIds, questionIndex],
  );
  if (playable.length === 0) return null;
  return (
    <Pressable
      role="link"
      aria-label="Practice these"
      onPress={() => router.push({ params: { misconceptions: playable.join(',') }, pathname: '/review' })}
      className="mt-3 self-start rounded border border-line px-3 py-2"
    >
      <Text className="font-mono text-xs uppercase tracking-widest text-ink">Practice these</Text>
    </Pressable>
  );
}

export function StudyNote() {
  const state = useStudyNote();
  if (state.status === 'hidden') return null;
  return (
    <View role="region" aria-label="This week's study note" className="mt-6 border-t border-line pt-6">
      <Text className="font-mono text-xs uppercase tracking-widest text-muted">This week&apos;s study note</Text>
      {state.status === 'ready' ? (
        <>
          <Text className="mt-3 text-sm leading-relaxed text-ink">{state.note}</Text>
          {state.misconceptionIds.length > 0 ? <PracticeLink misconceptionIds={state.misconceptionIds} /> : null}
        </>
      ) : (
        <Text className="mt-3 text-sm text-muted">
          {`Answer ${state.remaining} more ${state.remaining === 1 ? 'question' : 'questions'} this week for your study note.`}
        </Text>
      )}
    </View>
  );
}
