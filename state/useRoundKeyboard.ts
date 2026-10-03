// Maps the web key bindings onto a quiz round: answer keys only while the
// current question is open for an answer, Enter only once it is answered,
// and Escape closes the query drawer before it leaves the round. An A/B
// question has two options, so the third and fourth choice keys do nothing.
import type { Dispatch, SetStateAction } from 'react';

import { useKeyboardNav } from './useKeyboardNav';

type RoundKeyboardState = {
  currentType: 'ab' | 'bool' | 'mc' | undefined;
  isAnswered: boolean;
  isComplete: boolean;
  isQueryOpen: boolean;
  onAdvance: () => void;
  onAnswer: (value: number | boolean) => void;
  onExit: () => void;
  setIsQueryOpen: Dispatch<SetStateAction<boolean>>;
};

const AB_OPTION_COUNT = 2;

function pickChoiceHandler(currentType: RoundKeyboardState['currentType'], onAnswer: (value: number) => void) {
  if (currentType === 'mc') return onAnswer;
  if (currentType === 'ab') return (index: number) => (index < AB_OPTION_COUNT ? onAnswer(index) : undefined);
  return undefined;
}

export function useRoundKeyboard(round: RoundKeyboardState): void {
  const { currentType, isAnswered, isComplete, isQueryOpen, onAdvance, onAnswer, onExit, setIsQueryOpen } = round;
  const canAnswer = !isQueryOpen && !isAnswered;
  useKeyboardNav({
    isEnabled: !isComplete,
    onAdvance: !isQueryOpen && isAnswered ? onAdvance : undefined,
    onEscape: () => (isQueryOpen ? setIsQueryOpen(false) : onExit()),
    onSelectBool: canAnswer && currentType === 'bool' ? onAnswer : undefined,
    onSelectChoice: canAnswer ? pickChoiceHandler(currentType, onAnswer) : undefined,
    onToggleQuery: () => setIsQueryOpen((isOpen) => !isOpen),
  });
}
