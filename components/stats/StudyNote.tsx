// "This week's study note" on the home screen, for a signed-in user: a short paragraph written
// from their last 7 days of synced answers, or how many more answers it needs. Shows nothing for
// a guest, while loading, or when no note is available.
import { Text, View } from 'react-native';

import { useStudyNote } from '../../state/useStudyNote';

export function StudyNote() {
  const state = useStudyNote();
  if (state.status === 'hidden') return null;
  return (
    <View role="region" aria-label="This week's study note" className="mt-6 border-t border-line pt-6">
      <Text className="font-mono text-xs uppercase tracking-widest text-muted">This week&apos;s study note</Text>
      {state.status === 'ready' ? (
        <Text className="mt-3 text-sm leading-relaxed text-ink">{state.note}</Text>
      ) : (
        <Text className="mt-3 text-sm text-muted">
          {`Answer ${state.remaining} more ${state.remaining === 1 ? 'question' : 'questions'} this week for your study note.`}
        </Text>
      )}
    </View>
  );
}
