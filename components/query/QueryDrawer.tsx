// The Query panel: the syntax, method, and context behind the current
// question, in a modal that closes by its control, the backdrop, or the
// platform back action. Slides in unless reduced motion is requested. After
// a wrong answer it shows that choice's rationale first, above the query.
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import type { Grammar, Query } from '@syntactical/content-schema';

import { useIsReducedMotion } from '../../state/useIsReducedMotion';
import { CodeBlock } from '../quiz/CodeBlock';

type QueryDrawerProps = { chosenRationale?: string; grammar: Grammar; isOpen: boolean; onClose: () => void; query: Query };

export function QueryDrawer({ chosenRationale, grammar, isOpen, onClose, query }: QueryDrawerProps) {
  const isReducedMotion = useIsReducedMotion();
  const { explanation, syntax, tags, title } = query;
  return (
    <Modal testID="query-modal" aria-label={title} visible={isOpen} transparent animationType={isReducedMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <View className="flex-1 flex-row">
        <Pressable testID="query-backdrop" accessible={false} importantForAccessibility="no" className="flex-1 bg-black/60" onPress={onClose} />
        <ScrollView className="w-full max-w-[420px] border-l border-line bg-surface" contentContainerClassName="p-5">
          <View className="mb-6 flex-row items-center justify-between">
            <Text className="font-mono text-xs uppercase tracking-widest text-signal">Query</Text>
            <Pressable role="button" aria-label="Close query" onPress={onClose}>
              <Text className="font-mono text-xs text-muted">close</Text>
            </Pressable>
          </View>
          {chosenRationale ? (
            <View className="mb-6">
              <Text role="heading" aria-level={2} className="mb-2 font-mono text-sm uppercase tracking-widest text-amber">
                Why that answer is tempting
              </Text>
              <Text className="text-sm leading-relaxed text-ink">{chosenRationale}</Text>
            </View>
          ) : null}
          <Text role="heading" aria-level={2} className="mb-4 font-mono text-lg text-ink">
            {title}
          </Text>
          {syntax ? <CodeBlock className="mb-4" code={syntax} grammar={grammar} /> : null}
          <Text className="text-sm leading-relaxed text-ink">{explanation}</Text>
          {tags?.length ? (
            <View className="mt-6 flex-row flex-wrap gap-2">
              {tags.map((tag) => (
                <Text key={tag} className="rounded border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {tag}
                </Text>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
