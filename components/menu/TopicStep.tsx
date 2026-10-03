// Step 3 of the launch flow: the whole bank, or one of the bank's topics, each with its question
// count from the manifest. A topic with no questions in this bank is not listed. Keys: 1 picks
// the whole bank, 2 and up pick the topics in order, Escape goes back.
import { Pressable, Text, View } from 'react-native';

import { DIFFICULTIES } from '@syntactical/content-schema';

import { useKeyboardNav } from '../../state/useKeyboardNav';
import { useLanguageManifest } from '../../state/useLanguageManifest';

import { SelectionCard } from './SelectionCard';

type TopicStepProps = {
  difficulty: string;
  language: string;
  onBack: () => void;
  onSelectTopic: (topic: string | undefined) => void;
};

// The whole bank holds key 1, so topic keys start at 2.
const FIRST_TOPIC_KEY_HINT = 2;

function describeCount(count: number): string {
  return `${count} ${count === 1 ? 'question' : 'questions'}`;
}

export function TopicStep({ difficulty, language, onBack, onSelectTopic }: TopicStepProps) {
  const { languages } = useLanguageManifest();
  const { banks, label, topics: listedTopics } = languages.find(({ id }) => id === language) ?? {
    banks: {},
    label: language,
    topics: [],
  };
  const topicCounts = (banks as Record<string, { topicCounts: Record<string, number> } | undefined>)[difficulty]?.topicCounts ?? {};
  const topics = listedTopics.filter(({ id }) => (topicCounts[id] ?? 0) > 0);
  const difficultyLabel = DIFFICULTIES.find(({ id }) => id === difficulty)?.label ?? difficulty;
  useKeyboardNav({
    onEscape: onBack,
    onSelectChoice: (index) => {
      if (index === 0) onSelectTopic(undefined);
      else if (index <= topics.length) onSelectTopic(topics[index - 1].id);
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
        <SelectionCard
          keyHint={1}
          title="Whole bank"
          subtitle="Every question in this bank"
          onSelect={() => onSelectTopic(undefined)}
        />
        {topics.map(({ id, label: topicLabel }, index) => {
          const subtitle = describeCount(topicCounts[id] ?? 0);
          return (
            <SelectionCard
              key={id}
              keyHint={index + FIRST_TOPIC_KEY_HINT}
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
