// Step 4 of the launch flow, reached only for a topic whose pool offers a fixed length: how many
// questions to play from that topic. The whole bank picks its length on the topic step instead.
// Offers each fixed length smaller than the pool, then every question. Keys: 1 and up pick the
// options in order, Escape goes back to the topic step.
import { Pressable, Text, View } from 'react-native';

import { findDifficulty } from '../../services/content/findDifficulty';
import { findLanguageEntry } from '../../services/content/findLanguageEntry';
import { listRoundLengths } from '../../services/quiz/roundLength';
import { useKeyboardNav } from '../../state/useKeyboardNav';
import { useLanguageManifest } from '../../state/useLanguageManifest';

import { SelectionCard } from './SelectionCard';
import { pickKeyHint } from './pickKeyHint';

type LengthStepProps = {
  difficulty: string;
  language: string;
  onBack: () => void;
  // A fixed length, or undefined for every question in the pool.
  onSelectLength: (count: number | undefined) => void;
  // Undefined when the manifest gives no question count for the pool.
  poolSize: number | undefined;
};

export function LengthStep({ difficulty, language, onBack, onSelectLength, poolSize }: LengthStepProps) {
  const { languages } = useLanguageManifest();
  const label = findLanguageEntry(languages, language)?.label ?? language;
  const difficultyLabel = findDifficulty(difficulty)?.label ?? difficulty;
  const lengths = listRoundLengths(poolSize);
  useKeyboardNav({
    onEscape: onBack,
    onSelectChoice: (index) => {
      if (index < lengths.length) onSelectLength(lengths[index]);
      else if (index === lengths.length) onSelectLength(undefined);
    },
  });
  return (
    <View>
      <View className="mb-4 flex-row items-center justify-between">
        <Text role="heading" aria-level={1} className="font-mono text-xs uppercase tracking-widest text-muted">
          Step 4 / Select length{' '}
          <Text className="text-signal">
            {label} {difficultyLabel}
          </Text>
        </Text>
        <Pressable role="button" aria-label="Back" onPress={onBack}>
          <Text className="font-mono text-xs text-muted">Back</Text>
        </Pressable>
      </View>
      <View className="gap-3">
        {lengths.map((length, index) => (
          <SelectionCard
            key={length}
            keyHint={pickKeyHint(index + 1)}
            title={`${length} questions`}
            subtitle={poolSize === undefined ? `A random ${length}` : `A random ${length} of ${poolSize}`}
            onSelect={() => onSelectLength(length)}
          />
        ))}
        <SelectionCard
          keyHint={pickKeyHint(lengths.length + 1)}
          title={poolSize === undefined ? 'All questions' : `All ${poolSize} questions`}
          subtitle="Every question in this pool"
          onSelect={() => onSelectLength(undefined)}
        />
      </View>
    </View>
  );
}
