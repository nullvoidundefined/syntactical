// The review route's empty state: nothing is due now, and when the next
// review comes due (or how to start scheduling reviews when none exist).
import { Pressable, Text, View } from 'react-native';

type NothingDueProps = { nextDueAt: string | null; onBack: () => void };

function formatDueTime(instant: string): string {
  return new Date(instant).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function NothingDue({ nextDueAt, onBack }: NothingDueProps) {
  return (
    <View className="flex-1 items-center justify-center px-4 py-8">
      <View className="w-full max-w-xl">
        <Pressable role="link" aria-label="Back to languages" onPress={onBack}>
          <Text className="font-mono text-xs uppercase tracking-widest text-muted">Back</Text>
        </Pressable>
        <Text role="heading" aria-level={1} className="mt-6 font-mono text-3xl text-ink">
          Review
        </Text>
        <Text className="mt-6 font-mono text-sm text-ink">Nothing due</Text>
        <Text className="mt-2 text-sm text-muted">
          {nextDueAt === null
            ? 'Answer questions in any bank and missed ones come back here for review.'
            : `Next review due ${formatDueTime(nextDueAt)}`}
        </Text>
      </View>
    </View>
  );
}
