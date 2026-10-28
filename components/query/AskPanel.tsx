// "Ask about this card", at the end of the explanation: the learner types a follow-up question and
// gets a short answer from the server, which has the question, its answer key, and the choice they
// picked. Each ask stands alone; the panel shows the latest answer and "<remaining> of <limit> left
// today", and says why when there is none. At the daily limit it branches on the tier the server
// names, never on a number: a free learner is told the free tier's limit and the Pro limit and is
// offered Pro (See Pro calls onSeePro when the host gives it, else opens the Pro sheet here, and
// an offer that closes as unlocked clears the free-limit copy); a Pro learner is told the day's
// limit. After a wrong answer (canExplainMistake) it first offers "Explain my mistake": one tap,
// no typing, asks the server to explain the learner's choice; the explanation shows where an
// answer does, costs one ask, fails and meets the limit exactly as an ask does, and the button goes
// once it has answered, moving focus on the web to the explanation so it does not drop to the
// document. The drawer keys the panel by question, so nothing carries over to the next
// card, and a reply that lands after the panel is gone is dropped.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { ASK_MESSAGE_MAX_LENGTH } from '../../constants/appConfig';
import { requestAskAnswer, requestMistakeExplanation } from '../../services/ask/requestAskAnswer';
import type { AskResult } from '../../services/ask/types/AskResult';
import type { AskTarget } from '../../services/ask/types/AskTarget';
import { ProOffer, type ProOfferCloseReason } from '../purchase/ProOffer';

const BUSY = 'Too many questions at once. Try again in a minute.';
const UNAVAILABLE = 'No answer right now. Try again in a moment.';
const LIMIT_UNNAMED = "You've used today's questions. They reset at midnight UTC.";
const EXPLAIN_MISTAKE = 'Explain my mistake';

// onSeePro: the host opens the Pro sheet itself (the web drawer closes first, so the sheet is never
// stacked over the drawer's Modal and its focus trap). canExplainMistake: the learner's choice was
// wrong, so the panel offers to explain it.
type AskPanelProps = { canExplainMistake?: boolean; onSeePro?: () => void; target: AskTarget };

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

export function AskPanel({ canExplainMistake = false, onSeePro, target }: AskPanelProps) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'asking' | 'explaining' | null>(null);
  const [hasExplained, setHasExplained] = useState(false);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const isMounted = useRef(true);
  const answerRef = useRef<View>(null);
  // A learner who is now Pro is past the free limit: its copy and See Pro go.
  const closeOffer = useCallback((reason: ProOfferCloseReason) => {
    setIsOfferOpen(false);
    if (reason === 'unlocked') setFailure(null);
  }, []);

  useEffect(
    () => () => {
      isMounted.current = false;
    },
    [],
  );

  // The Explain my mistake button has gone; on the web, focus moves to the explanation it wrote.
  useEffect(() => {
    if (hasExplained && Platform.OS === 'web') (answerRef.current as unknown as HTMLElement | null)?.focus();
  }, [hasExplained]);

  const isBusy = busy !== null;
  const trimmed = message.trim();
  const canSend = trimmed !== '' && !isBusy;

  // Runs one ask or explanation; true when it answered.
  async function run(kind: 'asking' | 'explaining', asked: string, request: () => Promise<AskResult>) {
    setBusy(kind);
    setFailure(null);
    const result = await request();
    if (!isMounted.current) return false;
    setBusy(null);
    if (result.status === 'failed') {
      setFailure(result);
      return false;
    }
    const { answer, limit, remaining } = result;
    setAnswered({ answer, asked, limit, remaining });
    return true;
  }

  async function send() {
    if (!canSend) return;
    if (await run('asking', trimmed, () => requestAskAnswer(target, trimmed))) setMessage('');
  }

  async function explainMistake() {
    if (isBusy) return;
    if (await run('explaining', EXPLAIN_MISTAKE, () => requestMistakeExplanation(target))) setHasExplained(true);
  }

  return (
    <View className="mt-8 border-t border-line pt-6">
      <Text role="heading" aria-level={2} className="mb-3 font-mono text-sm uppercase tracking-widest text-signal">
        Ask about this card
      </Text>
      {canExplainMistake && !hasExplained ? (
        <Pressable
          role="button"
          aria-label={EXPLAIN_MISTAKE}
          aria-disabled={isBusy}
          disabled={isBusy}
          onPress={() => void explainMistake()}
          className={`mb-4 self-start border border-ink px-4 py-2 ${isBusy ? 'opacity-50' : ''}`}
        >
          <Text className="font-mono text-xs uppercase tracking-widest text-ink">
            {busy === 'explaining' ? 'Explaining…' : EXPLAIN_MISTAKE}
          </Text>
        </Pressable>
      ) : null}
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
        <Text className="font-mono text-xs uppercase tracking-widest text-ink">
          {busy === 'asking' ? 'Asking…' : 'Ask'}
        </Text>
      </Pressable>
      <View aria-live="polite">
        {failure ? <Text className="mt-3 text-sm text-amber">{describeFailure(failure)}</Text> : null}
        {answered ? (
          <View ref={answerRef} tabIndex={-1} className="mt-4">
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
