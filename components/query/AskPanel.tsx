// "Ask about this card", at the end of the explanation: the learner types a follow-up question and
// gets a short answer from the server, which has the question, its answer key, and the choice they
// picked. Each ask stands alone; the panel shows the latest answer and the answers left today, and
// says why when there is none. The drawer keys the panel by question, so nothing carries over to
// the next card, and a reply that lands after the panel is gone is dropped.
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ASK_MESSAGE_MAX_LENGTH } from '../../constants/appConfig';
import { requestAskAnswer } from '../../services/ask/requestAskAnswer';
import type { AskFailure } from '../../services/ask/types/AskResult';
import type { AskTarget } from '../../services/ask/types/AskTarget';

const FAILURE_MESSAGES: Record<AskFailure, string> = {
  busy: 'Too many questions at once. Try again in a minute.',
  limit: "You've used today's questions. They reset at midnight UTC.",
  locked: 'Asking about a card comes with any purchase.',
  unavailable: 'No answer right now. Try again in a moment.',
};

type AskPanelProps = { target: AskTarget };

type Answered = { answer: string; asked: string; remaining: number };

export function AskPanel({ target }: AskPanelProps) {
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [failure, setFailure] = useState<AskFailure | null>(null);
  const isMounted = useRef(true);

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
      setFailure(result.reason);
      return;
    }
    const { answer, remaining } = result;
    setAnswered({ answer, asked: trimmed, remaining });
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
        {failure ? <Text className="mt-3 text-sm text-amber">{FAILURE_MESSAGES[failure]}</Text> : null}
        {answered ? (
          <View className="mt-4">
            <Text className="mb-2 font-mono text-xs text-muted">{answered.asked}</Text>
            <Text className="text-sm leading-relaxed text-ink">{answered.answer}</Text>
            <Text className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted">
              {answered.remaining} {answered.remaining === 1 ? 'question' : 'questions'} left today
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
