// Chrome shared by every question card: the language/difficulty/type
// header, the verified badge, the Query trigger, and a body slot with a
// stable minimum height so advancing does not shift the controls below it.
import type { Provenance } from '@syntactical/content-schema';

import type { ReactNode } from 'react';

import { Pressable, Text, View } from 'react-native';

import { VerifiedBadge } from './VerifiedBadge';

const TYPE_LABEL = { ab: 'Which is optimal', bool: 'True / False', mc: 'Multiple choice' } as const;

type QuestionCardFrameProps = {
  children: ReactNode;
  difficultyLabel: string;
  languageLabel: string;
  onOpenQuery: () => void;
  provenance: Provenance;
  type: 'ab' | 'bool' | 'mc';
};

export function QuestionCardFrame({ children, difficultyLabel, languageLabel, onOpenQuery, provenance, type }: QuestionCardFrameProps) {
  return (
    <View className="overflow-hidden rounded-lg border border-line bg-surface">
      <View className="flex-row flex-wrap items-center justify-between border-b border-line px-4 py-3">
        <View>
          <Text role="heading" aria-level={1} className="font-mono text-[11px] uppercase tracking-widest text-muted">
            {`${languageLabel} / ${difficultyLabel} / ${TYPE_LABEL[type]}`}
          </Text>
          <VerifiedBadge provenance={provenance} />
        </View>
        <Pressable role="button" aria-label="Query" onPress={onOpenQuery} className="rounded border border-line px-2 py-1">
          <Text className="font-mono text-[11px] uppercase tracking-widest text-muted">Query</Text>
        </Pressable>
      </View>
      <View className="min-h-[22rem] px-4 py-5">{children}</View>
    </View>
  );
}
