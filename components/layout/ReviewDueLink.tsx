// The "N reviews due" link in the app bar, shown only while at least one
// review is due; it opens the review route.
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useReviewQueue } from '../../state/useReviewQueue';

export function ReviewDueLink() {
  const { dueQuestions } = useReviewQueue();
  const { length: dueCount } = dueQuestions;
  if (dueCount === 0) return null;
  const label = dueCount === 1 ? '1 review due' : `${dueCount} reviews due`;
  return (
    <Pressable role="link" aria-label={label} onPress={() => router.push('/review')}>
      <Text className="font-mono text-xs uppercase tracking-widest text-signal">{label}</Text>
    </Pressable>
  );
}
