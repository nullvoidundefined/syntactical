// Web-only global key bindings from KEY_BINDINGS: choice keys select by
// position, T and F answer booleans, Enter advances, Q toggles the query,
// and Escape backs out. A no-op on native, where every action is a touch
// target. Handlers left undefined make their keys inert.
import { useEffect, useRef } from 'react';

import { Platform } from 'react-native';

import { KEY_BINDINGS } from '../constants/appConfig';

type KeyboardHandlers = {
  isEnabled?: boolean;
  onAdvance?: () => void;
  onEscape?: () => void;
  onSelectBool?: (value: boolean) => void;
  onSelectChoice?: (index: number) => void;
  onToggleQuery?: () => void;
};

// Two rows of choice keys (digits, then letters) bind the same choices.
const CHOICE_KEY_ROWS = 2;
const CHOICES_PER_ROW = KEY_BINDINGS.choice.length / CHOICE_KEY_ROWS;

function isBoundKey(bindings: readonly string[], key: string): boolean {
  return bindings.some((binding) => binding.toUpperCase() === key.toUpperCase());
}

function readChoiceIndex(key: string): number | null {
  const position = KEY_BINDINGS.choice.findIndex((binding) => binding.toUpperCase() === key.toUpperCase());
  return position === -1 ? null : position % CHOICES_PER_ROW;
}

function dispatchKey(key: string, handlers: KeyboardHandlers): void {
  const { onAdvance, onEscape, onSelectBool, onSelectChoice, onToggleQuery } = handlers;
  const { boolFalse, boolTrue, escape, next, query } = KEY_BINDINGS;
  if (isBoundKey(escape, key)) return onEscape?.();
  if (isBoundKey(next, key)) return onAdvance?.();
  if (isBoundKey(query, key)) return onToggleQuery?.();
  if (isBoundKey(boolTrue, key)) return onSelectBool?.(true);
  if (isBoundKey(boolFalse, key)) return onSelectBool?.(false);
  const choiceIndex = readChoiceIndex(key);
  if (choiceIndex !== null) onSelectChoice?.(choiceIndex);
}

export function useKeyboardNav(handlers: KeyboardHandlers): void {
  const latestHandlers = useRef(handlers);
  latestHandlers.current = handlers;
  const { isEnabled = true } = handlers;

  useEffect(() => {
    if (Platform.OS !== 'web' || !isEnabled) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      dispatchKey(event.key, latestHandlers.current);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled]);
}
