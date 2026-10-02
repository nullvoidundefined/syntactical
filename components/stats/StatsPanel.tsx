// Lifetime accuracy and a per-language, per-difficulty breakdown for the
// languages the manifest currently lists.
import { Text, View } from 'react-native';

import { DIFFICULTIES } from '../../constants/appConfig';
import type { Manifest } from '../../services/content/types/Manifest';
import { calculateAccuracy } from '../../services/quiz/calculateAccuracy';
import { buildStatsKey } from '../../services/stats/buildStatsKey';
import type { Stats } from '../../services/stats/types/Stats';
import { useQuizStats } from '../../state/StatsProvider';
import { useLanguageManifest } from '../../state/useLanguageManifest';

type BreakdownEntry = { accuracy: number; key: string; label: string };

function buildBreakdown(stats: Stats, manifest: Manifest): BreakdownEntry[] {
  const { tracks } = stats;
  return manifest.languages.flatMap(({ glyph, id: language }) =>
    DIFFICULTIES.flatMap(({ id: difficulty, label }) => {
      const entry = tracks[buildStatsKey({ difficulty, language })];
      if (!entry || entry.attempted === 0) return [];
      const { attempted, correct } = entry;
      return [{ accuracy: calculateAccuracy(correct, attempted), key: `${language}:${difficulty}`, label: `${glyph} / ${label}` }];
    }),
  );
}

export function StatsPanel() {
  const { stats } = useQuizStats();
  const manifest = useLanguageManifest();
  const { attempted, correct } = stats.totals;
  const hasHistory = attempted > 0;
  return (
    <View className="mt-10 border-t border-line pt-6">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-xs uppercase tracking-widest text-muted">Lifetime accuracy</Text>
        <Text className="font-mono text-xs text-ink">{hasHistory ? `${calculateAccuracy(correct, attempted)}%` : 'none yet'}</Text>
      </View>
      {hasHistory ? (
        <View className="mt-4 flex-row flex-wrap gap-2">
          {buildBreakdown(stats, manifest).map(({ accuracy, key, label }) => (
            <View key={key} className="rounded border border-line px-3 py-2">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</Text>
              <Text className="mt-1 font-mono text-sm text-ink">{`${accuracy}%`}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
