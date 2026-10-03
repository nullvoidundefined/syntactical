// What backs an A/B answer once it is revealed: a benchmark result, the failing
// edge case, or the rubric's reason, titled to match the criterion type.
import { Text, View } from 'react-native';

import type { Criterion } from '@syntactical/content-schema';

const EVIDENCE_TITLE: Record<Criterion['type'], string> = {
  correctness: 'Failing edge case',
  performance: 'Benchmark result',
  readability: 'Rubric reason (judged, not run)',
};

type AbEvidenceProps = { criterion: Criterion };

export function AbEvidence({ criterion }: AbEvidenceProps) {
  const { evidence, type } = criterion;
  return (
    <View className="mt-4 rounded-md border border-line px-4 py-3">
      <Text role="heading" aria-level={2} className="font-mono text-[11px] uppercase tracking-widest text-muted">
        {EVIDENCE_TITLE[type]}
      </Text>
      <Text className="mt-1 text-sm leading-relaxed text-ink">{evidence}</Text>
    </View>
  );
}
