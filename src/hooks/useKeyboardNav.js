// Global keydown listener that maps the app's fixed key bindings (number
// keys / A-D for choices, T/F for booleans, Enter to advance, Q to toggle
// the Query drawer, Escape to bail to the menu) onto caller-supplied
// handlers. Callers pass `null`/`undefined` for any handler they don't
// want wired up in the current view.

import { useEffect } from 'react';

const CHOICE_KEY_TO_INDEX = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  a: 0,
  b: 1,
  c: 2,
  d: 3,
};

/**
 * @param {object} handlers
 * @param {(index: number) => void} [handlers.onSelectChoice]
 * @param {(value: boolean) => void} [handlers.onSelectBool]
 * @param {() => void} [handlers.onAdvance]
 * @param {() => void} [handlers.onToggleQuery]
 * @param {() => void} [handlers.onEscape]
 * @param {boolean} [handlers.enabled]
 */
export function useKeyboardNav({
  onSelectChoice,
  onSelectBool,
  onAdvance,
  onToggleQuery,
  onEscape,
  enabled = true,
}) {
  useEffect(() => {
    if (!enabled) return undefined;

    function handleKeyDown(event) {
      const key = event.key;
      const lowerKey = key.toLowerCase();

      if (key === 'Escape' && onEscape) {
        onEscape();
        return;
      }

      if (key === 'Enter' && onAdvance) {
        onAdvance();
        return;
      }

      if (lowerKey === 'q' && onToggleQuery) {
        onToggleQuery();
        return;
      }

      if (onSelectBool && (lowerKey === 't' || lowerKey === 'f')) {
        onSelectBool(lowerKey === 't');
        return;
      }

      if (onSelectChoice && lowerKey in CHOICE_KEY_TO_INDEX) {
        onSelectChoice(CHOICE_KEY_TO_INDEX[lowerKey]);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onSelectChoice, onSelectBool, onAdvance, onToggleQuery, onEscape]);
}
