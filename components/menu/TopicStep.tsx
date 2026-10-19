// Step 3 of the launch flow: how many questions to play from the whole bank (each fixed length
// smaller than the bank, then every question), or one of the bank's topics with its question
// count from the manifest. A topic with no questions in this bank is not listed. Keys: 1 and up
// pick the length cards, then the topics in order; Escape goes back.
import { Pressable, Text, View } from 'react-native';

import { DIFFICULTIES } from '@syntactical/content-schema';

import { listRoundLengths, readPoolSize, reconcilePoolSize } from '../../services/quiz/roundLength';
import { useKeyboardNav } from '../../state/useKeyboardNav';
import { useLanguageManifest } from '../../state/useLanguageManifest';

import { SelectionCard } from './SelectionCard';
import { pickKeyHint } from './pickKeyHint';

type TopicStepProps = {
  // The loaded bank's questions when known; their count corrects a stale manifest count.
  bankQuestions?: readonly { topic?: string }[];
  difficulty: string;
  language: string;
  onBack: () => void;
  // A fixed length, or undefined for every question in the bank.
  onSelectLength: (count: number | undefined) => void;
  onSelectTopic: (topic: string) => void;
};

function describeCount(count: number): string {
  return `${count} ${count === 1 ? 'question' : 'questions'}`;
}

export function TopicStep({
  bankQuestions,
  difficulty,
  language,
  onBack,
  onSelectLength,
  onSelectTopic,
}: TopicStepProps) {
  const { languages } = useLanguageManifest();
  const {
    banks,
    label,
    topics: listedTopics,
  } = languages.find(({ id }) => id === language) ?? {
    banks: {},
    label: language,
    topics: [],
  };
  const topicCounts =
    (banks as Record<string, { topicCounts: Record<string, number> } | undefined>)[difficulty]?.topicCounts ?? {};
  const topics = listedTopics.filter(({ id }) => (topicCounts[id] ?? 0) > 0);
  const difficultyLabel = DIFFICULTIES.find(({ id }) => id === difficulty)?.label ?? difficulty;
  const poolSize = reconcilePoolSize(readPoolSize(topicCounts, undefined), bankQuestions, undefined);
  const lengths = listRoundLengths(poolSize);
  // Whole-bank cards come first: each fixed length, then every question.
  const lengthCardCount = lengths.length + 1;
  useKeyboardNav({
    onEscape: onBack,
    onSelectChoice: (index) => {
      if (index < lengths.length) onSelectLength(lengths[index]);
      else if (index === lengths.length) onSelectLength(undefined);
      else if (index - lengthCardCount < topics.length) onSelectTopic(topics[index - lengthCardCount].id);
    },
  });
  return (
    <View>
      <View className="mb-4 flex-row items-center justify-between">
        <Text role="heading" aria-level={1} className="font-mono text-xs uppercase tracking-widest text-muted">
          Step 3 / Select topic{' '}
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
            subtitle={`A random ${length} from this bank`}
            onSelect={() => onSelectLength(length)}
          />
        ))}
        <SelectionCard
          keyHint={pickKeyHint(lengthCardCount)}
          title={poolSize === undefined ? 'All questions' : `All ${poolSize} questions`}
          subtitle="Every question in this bank"
          onSelect={() => onSelectLength(undefined)}
        />
        {topics.map(({ id, label: topicLabel }, index) => {
          const subtitle = describeCount(topicCounts[id] ?? 0);
          return (
            <SelectionCard
              key={id}
              keyHint={pickKeyHint(index + lengthCardCount + 1)}
              title={topicLabel}
              subtitle={subtitle}
              ariaLabel={`${topicLabel}, ${subtitle}`}
              onSelect={() => onSelectTopic(id)}
            />
          );
        })}
      </View>
    </View>
  );
}
