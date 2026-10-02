// Maps the web key bindings onto a quiz round: answer keys only while the
// current question is open for an answer, Enter only once it is answered,
// and Escape closes the query drawer before it leaves the round.
import type { Dispatch, SetStateAction } from 'react';

import { useKeyboardNav } from './useKeyboardNav';

type RoundKeyboardState = {
  currentType: 'bool' | 'mc' | undefined;
  isAnswered: boolean;
  isComplete: boolean;
  isQueryOpen: boolean;
  onAdvance: () => void;
  onAnswer: (value: number | boolean) => void;
  onExit: () => void;
  setIsQueryOpen: Dispatch<SetStateAction<boolean>>;
};

export function useRoundKeyboard(round: RoundKeyboardState): void {
  const { currentType, isAnswered, isComplete, isQueryOpen, onAdvance, onAnswer, onExit, setIsQueryOpen } = round;
  const canAnswer = !isQueryOpen && !isAnswered;
  useKeyboardNav({
    isEnabled: !isComplete,
    onAdvance: !isQueryOpen && isAnswered ? onAdvance : undefined,
    onEscape: () => (isQueryOpen ? setIsQueryOpen(false) : onExit()),
    onSelectBool: canAnswer && currentType === 'bool' ? onAnswer : undefined,
    onSelectChoice: canAnswer && currentType === 'mc' ? onAnswer : undefined,
    onToggleQuery: () => setIsQueryOpen((isOpen) => !isOpen),
  });
}
