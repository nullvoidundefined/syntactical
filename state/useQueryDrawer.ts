// The query drawer's open state and the rationale it shows first. Only `explain` sets the
// rationale; every other way of opening or closing the drawer (the Query button, the Q key,
// advancing) clears it, so the Query button never shows a leftover rationale.
import { type SetStateAction, useState } from 'react';

export function useQueryDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [rationale, setRationale] = useState<string | undefined>(undefined);

  function setOpen(next: SetStateAction<boolean>) {
    setRationale(undefined);
    setIsOpen(next);
  }

  function explain(chosenRationale: string | undefined) {
    setRationale(chosenRationale);
    setIsOpen(true);
  }

  return { explain, isOpen, rationale, setOpen };
}
