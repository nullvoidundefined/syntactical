// The weekly weakness report under lifetime stats: a "keep playing" state
// until the last 7 days hold 20 answers, then the most-missed
// misconceptions with their descriptions; each opens a review round of
// that misconception's questions.
import { useMemo } from 'react';

import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import type { Manifest } from '@syntactical/content-schema';

import { buildWeaknessReport } from '../../services/progress/buildWeaknessReport';
import type { WeakSpot } from '../../services/progress/types/WeaknessReport';
import { useQuizStats } from '../../state/StatsProvider';
import { useLanguageManifest } from '../../state/useLanguageManifest';
import { useReviewQueue } from '../../state/useReviewQueue';

const PERCENT = 100;

function buildDescriptions(manifest: Manifest): Map<string, string> {
  return new Map(manifest.languages.flatMap(({ misconceptions }) => misconceptions.map(({ description, id }) => [id, description] as const)));
}

function WeakSpotLink({ spot }: { spot: WeakSpot }) {
  const { attempts, description, misconceptionId, misses, missRate } = spot;
  const summary = `missed ${misses} of ${attempts}`;
  return (
    <Pressable
      role="link"
      aria-label={`Review ${description}, ${summary}`}
      onPress={() => router.push({ params: { misconception: misconceptionId }, pathname: '/review' })}
      className="rounded border border-line px-3 py-2"
    >
      <Text className="text-sm text-ink">{description}</Text>
      <Text className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
        {`${Math.round(missRate * PERCENT)}% ${summary}`}
      </Text>
    </Pressable>
  );
}

export function WeaknessReport() {
  const { eventLog } = useQuizStats();
  const { questionIndex } = useReviewQueue();
  const manifest = useLanguageManifest();
  const { remaining, spots, status } = useMemo(
    () => buildWeaknessReport(eventLog, questionIndex, buildDescriptions(manifest), new Date()),
    [eventLog, manifest, questionIndex],
  );
  return (
    <View role="region" aria-label="Weak spots this week" className="mt-6">
      <Text className="font-mono text-xs uppercase tracking-widest text-muted">Weak spots this week</Text>
      {status === 'gathering' ? (
        <View className="mt-3">
          <Text className="text-sm text-ink">Keep playing to see your weak spots</Text>
          <Text className="mt-1 text-sm text-muted">
            {remaining === 1 ? '1 more answer this week' : `${remaining} more answers this week`}
          </Text>
        </View>
      ) : (
        <WeakSpotList spots={spots} />
      )}
    </View>
  );
}

function WeakSpotList({ spots }: { spots: WeakSpot[] }) {
  if (spots.length === 0) return <Text className="mt-3 text-sm text-muted">No repeated misses this week</Text>;
  return (
    <View role="list" className="mt-3 gap-2">
      {spots.map((spot) => (
        <View role="listitem" key={spot.misconceptionId}>
          <WeakSpotLink spot={spot} />
        </View>
      ))}
    </View>
  );
}
