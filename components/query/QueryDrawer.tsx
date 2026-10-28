// The Query panel, in a modal that closes by its control, the backdrop, or the platform back
// action. Before the learner answers it shows only the title and documentation links, which must
// not give the answer away: on an easy card the syntax teaches the very rule being tested. After
// they answer it is the full explanation: a wrong choice's rationale first, then the title, the
// syntax, the explanation, the tags, and, for judged cards, the first evidence source; then, when
// the round passes an ask target (any signed-in learner), the "Ask about this card" box, which
// after a wrong answer (isMistake) also offers "Explain my mistake". Slides in unless reduced motion
// is requested. The panel pads by the device's safe-area insets, since an Android modal draws
// under the status bar and gesture bar. On the web, See Pro at the Ask limit closes the drawer and
// opens the Pro sheet from here once the drawer has gone: react-native-web's Modal traps focus and
// closes on Escape, so a sheet stacked over it could never hold focus. On native the sheet opens
// over the drawer from the Ask panel itself, since a second native modal is presented from inside the first.
import { useCallback, useContext, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import type { EvidenceSource, Grammar, Query } from '@syntactical/content-schema';

import type { AskTarget } from '../../services/ask/types/AskTarget';
import { useIsReducedMotion } from '../../state/useIsReducedMotion';
import { ProOffer } from '../purchase/ProOffer';
import { CodeBlock } from '../quiz/CodeBlock';

import { AskPanel } from './AskPanel';
import { DocLinks } from './DocLinks';
import { SourceLink } from './SourceLink';

type QueryDrawerProps = {
  // Set only after an answer, for a learner who may ask; the box shows when it is set.
  askTarget?: AskTarget;
  chosenRationale?: string;
  evidenceSource?: EvidenceSource;
  grammar: Grammar;
  isAnswered: boolean;
  // The learner's answer was wrong; with an ask target the box offers "Explain my mistake".
  isMistake?: boolean;
  isOpen: boolean;
  onClose: () => void;
  query: Query;
};

export function QueryDrawer(props: QueryDrawerProps) {
  const { askTarget, chosenRationale, evidenceSource, grammar, isAnswered, isMistake, isOpen, onClose, query } = props;
  const isReducedMotion = useIsReducedMotion();
  const insets = useContext(SafeAreaInsetsContext);
  const { docs, explanation, syntax, tags, title } = query;
  // waiting: See Pro closed the drawer; the sheet opens when the Modal reports it dismissed.
  const [proOffer, setProOffer] = useState<'closed' | 'open' | 'waiting'>('closed');
  const closeProOffer = useCallback(() => setProOffer('closed'), []);
  const openWaitingProOffer = useCallback(() => setProOffer((state) => (state === 'waiting' ? 'open' : state)), []);
  const seePro =
    Platform.OS === 'web'
      ? () => {
          setProOffer('waiting');
          onClose();
        }
      : undefined;
  return (
    <>
      <Modal
        testID="query-modal"
        aria-label={title}
        visible={isOpen}
        transparent
        animationType={isReducedMotion ? 'none' : 'slide'}
        onDismiss={openWaitingProOffer}
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
              {isAnswered && syntax ? <CodeBlock className="mb-4" code={syntax} grammar={grammar} /> : null}
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
              {isAnswered && askTarget ? (
                <AskPanel
                  key={`${askTarget.bankKey}/${askTarget.questionId}`}
                  canExplainMistake={isMistake}
                  onSeePro={seePro}
                  target={askTarget}
                />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {proOffer === 'open' ? <ProOffer onClose={closeProOffer} source="ask_limit" /> : null}
    </>
  );
}
