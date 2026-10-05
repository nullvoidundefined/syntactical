// Step 4 of the launch flow: how many questions to play from the chosen pool (the whole bank or
// one topic). Offers each fixed length smaller than the pool, then every question. Keys: 1 and up
// pick the options in order, Escape goes back to the topic step.
import { Pressable, Text, View } from 'react-native';

import { DIFFICULTIES } from '@syntactical/content-schema';

import { listRoundLengths } from '../../services/quiz/roundLength';
import { useKeyboardNav } from '../../state/useKeyboardNav';
import { useLanguageManifest } from '../../state/useLanguageManifest';

import { SelectionCard } from './SelectionCard';

type LengthStepProps = {
  difficulty: string;
  language: string;
  onBack: () => void;
  // A fixed length, or undefined for every question in the pool.
  onSelectLength: (count: number | undefined) => void;
  poolSize: number;
};

export function LengthStep({ difficulty, language, onBack, onSelectLength, poolSize }: LengthStepProps) {
  const { languages } = useLanguageManifest();
  const label = languages.find(({ id }) => id === language)?.label ?? language;
  const difficultyLabel = DIFFICULTIES.find(({ id }) => id === difficulty)?.label ?? difficulty;
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
            keyHint={index + 1}
            title={`${length} questions`}
            subtitle={`A random ${length} of ${poolSize}`}
            onSelect={() => onSelectLength(length)}
          />
        ))}
        <SelectionCard
          keyHint={lengths.length + 1}
          title={`All ${poolSize} questions`}
          subtitle="Every question in this pool"
          onSelect={() => onSelectLength(undefined)}
        />
      </View>
    </View>
  );
}
