// The Query panel, in a modal that closes by its control, the backdrop, or the platform back
// action. Before the learner answers it is a reference: the title, syntax, and documentation
// links, which must not give the answer away (a query marked `isSyntaxAfterAnswer` holds its
// syntax back until after an answer). After they answer it is the full explanation: a
// wrong choice's rationale first, then the reference, the explanation, the tags, and, for judged
// cards, the first evidence source. Slides in unless reduced motion is requested. The panel pads by
// the device's safe-area insets, since an Android modal draws under the status bar and gesture bar.
import { useContext } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import type { EvidenceSource, Grammar, Query } from '@syntactical/content-schema';

import { useIsReducedMotion } from '../../state/useIsReducedMotion';
import { CodeBlock } from '../quiz/CodeBlock';

import { DocLinks } from './DocLinks';
import { SourceLink } from './SourceLink';

type QueryDrawerProps = {
  chosenRationale?: string;
  evidenceSource?: EvidenceSource;
  grammar: Grammar;
  isAnswered: boolean;
  isOpen: boolean;
  onClose: () => void;
  query: Query;
};

export function QueryDrawer(props: QueryDrawerProps) {
  const { chosenRationale, evidenceSource, grammar, isAnswered, isOpen, onClose, query } = props;
  const isReducedMotion = useIsReducedMotion();
  const insets = useContext(SafeAreaInsetsContext);
  const { docs, explanation, isSyntaxAfterAnswer, syntax, tags, title } = query;
  const isSyntaxShown = Boolean(syntax) && (isAnswered || isSyntaxAfterAnswer !== true);
  return (
    <Modal
      testID="query-modal"
      aria-label={title}
      visible={isOpen}
      transparent
      animationType={isReducedMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <View className="flex-1 flex-row">
        <Pressable
          testID="query-backdrop"
          accessible={false}
          importantForAccessibility="no"
          className="flex-1 bg-black/60"
          onPress={onClose}
        />
        <View
          className="w-full max-w-[420px] border-l border-line bg-surface"
          style={{ paddingBottom: insets?.bottom ?? 0, paddingTop: insets?.top ?? 0 }}
        >
          <ScrollView className="flex-1" contentContainerClassName="p-5">
            <View className="mb-6 flex-row items-center justify-between">
              <Text className="font-mono text-xs uppercase tracking-widest text-signal">
                {isAnswered ? 'Explanation' : 'Query'}
              </Text>
              <Pressable role="button" aria-label="Close query" onPress={onClose}>
                <Text className="font-mono text-xs text-muted">close</Text>
              </Pressable>
            </View>
            {isAnswered && chosenRationale ? (
              <View className="mb-6">
                <Text
                  role="heading"
                  aria-level={2}
                  className="mb-2 font-mono text-sm uppercase tracking-widest text-amber"
                >
                  Why that answer is tempting
                </Text>
                <Text className="text-sm leading-relaxed text-ink">{chosenRationale}</Text>
              </View>
            ) : null}
            <Text role="heading" aria-level={2} className="mb-4 font-mono text-lg text-ink">
              {title}
            </Text>
            {isSyntaxShown ? <CodeBlock className="mb-4" code={syntax ?? ''} grammar={grammar} /> : null}
            {isAnswered ? (
              <>
                <Text className="text-sm leading-relaxed text-ink">{explanation}</Text>
                {tags?.length ? (
                  <View className="mt-6 flex-row flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Text
                        key={tag}
                        className="rounded border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted"
                      >
                        {tag}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <Text className="text-sm leading-relaxed text-muted">Answer to see the full explanation.</Text>
            )}
            {docs?.length ? <DocLinks docs={docs} /> : null}
            {isAnswered && evidenceSource ? <SourceLink source={evidenceSource} /> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
