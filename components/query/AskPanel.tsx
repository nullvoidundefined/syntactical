// "Ask about this card", at the end of the explanation: the learner types a follow-up question and
// gets a short answer from the server, which has the question, its answer key, and the choice they
// picked. Each ask stands alone; the panel shows the latest answer and "<remaining> of <limit> left
// today", and says why when there is none. At the daily limit it branches on the tier the server
// names, never on a number: a free learner is told the free tier's limit and the Pro limit and is
// offered Pro (See Pro calls onSeePro when the host gives it, else opens the Pro sheet here); a Pro
// learner is told the day's limit. The drawer keys
// the panel by question, so nothing carries over to the next card, and a reply that lands after
// the panel is gone is dropped.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ASK_MESSAGE_MAX_LENGTH } from '../../constants/appConfig';
import { requestAskAnswer } from '../../services/ask/requestAskAnswer';
import type { AskResult } from '../../services/ask/types/AskResult';
import type { AskTarget } from '../../services/ask/types/AskTarget';
import { ProOffer } from '../purchase/ProOffer';

const BUSY = 'Too many questions at once. Try again in a minute.';
const UNAVAILABLE = 'No answer right now. Try again in a moment.';
const LIMIT_UNNAMED = "You've used today's questions. They reset at midnight UTC.";

// onSeePro: the host opens the Pro sheet itself (the web drawer closes first, so the sheet is never
// stacked over the drawer's Modal and its focus trap).
type AskPanelProps = { onSeePro?: () => void; target: AskTarget };

type Failure = Extract<AskResult, { status: 'failed' }>;

type Answered = { answer: string; asked: string; limit: number; remaining: number };

function isFreeLimit(failure: Failure | null): boolean {
  return failure?.reason === 'limit' && failure.tier === 'free';
}

function describeFailure(failure: Failure): string {
  if (failure.reason !== 'limit') return failure.reason === 'busy' ? BUSY : UNAVAILABLE;
  if (failure.limit === undefined) return LIMIT_UNNAMED;
  if (failure.tier === 'free') {
    const proLine = failure.proLimit === undefined ? '' : ` Pro has ${failure.proLimit}.`;
    return `That is the free tier's ${failure.limit} for today.${proLine}`;
  }
  return `That is today's ${failure.limit}.`;
}

export function AskPanel({ onSeePro, target }: AskPanelProps) {
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const isMounted = useRef(true);
  const closeOffer = useCallback(() => setIsOfferOpen(false), []);

  useEffect(
    () => () => {
      isMounted.current = false;
    },
    [],
  );

  const trimmed = message.trim();
  const canSend = trimmed !== '' && !isBusy;

  async function send() {
    if (!canSend) return;
    setIsBusy(true);
    setFailure(null);
    const result = await requestAskAnswer(target, trimmed);
    if (!isMounted.current) return;
    setIsBusy(false);
    if (result.status === 'failed') {
      setFailure(result);
      return;
    }
    const { answer, limit, remaining } = result;
    setAnswered({ answer, asked: trimmed, limit, remaining });
    setMessage('');
  }

  return (
    <View className="mt-8 border-t border-line pt-6">
      <Text role="heading" aria-level={2} className="mb-3 font-mono text-sm uppercase tracking-widest text-signal">
        Ask about this card
      </Text>
      <TextInput
        aria-label="Your question about this card"
        editable={!isBusy}
        maxLength={ASK_MESSAGE_MAX_LENGTH}
        multiline
        placeholder="Why is this the answer?"
        value={message}
        onChangeText={setMessage}
        className="min-h-[64px] border border-line px-3 py-2 text-sm text-ink"
      />
      <Pressable
        role="button"
        aria-label="Ask"
        aria-disabled={!canSend}
        disabled={!canSend}
        onPress={() => void send()}
        className={`mt-3 self-start border border-ink px-4 py-2 ${canSend ? '' : 'opacity-50'}`}
      >
        <Text className="font-mono text-xs uppercase tracking-widest text-ink">{isBusy ? 'Asking…' : 'Ask'}</Text>
      </Pressable>
      <View aria-live="polite">
        {failure ? <Text className="mt-3 text-sm text-amber">{describeFailure(failure)}</Text> : null}
        {answered ? (
          <View className="mt-4">
            <Text className="mb-2 font-mono text-xs text-muted">{answered.asked}</Text>
            <Text className="text-sm leading-relaxed text-ink">{answered.answer}</Text>
            <Text className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted">
              {`${answered.remaining} of ${answered.limit} left today`}
            </Text>
          </View>
        ) : null}
      </View>
      {isFreeLimit(failure) ? (
        <Pressable
          role="button"
          aria-label="See Pro"
          onPress={() => (onSeePro ? onSeePro() : setIsOfferOpen(true))}
          className="mt-3 self-start border border-ink px-4 py-2"
        >
          <Text className="font-mono text-xs uppercase tracking-widest text-ink">See Pro</Text>
        </Pressable>
      ) : null}
      {isOfferOpen ? <ProOffer onClose={closeOffer} source="ask_limit" /> : null}
    </View>
  );
}
