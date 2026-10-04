// Hosts a modal dialog's overlay above the whole page. On the web the overlay is rendered into
// document.body: React Native Web views are stacking contexts, so a fixed overlay left inside the
// app bar or the page content would be confined to that context and paint under, or over, only
// part of the page. On native the caller's own Modal already does this, so the children pass through.
import type { ReactNode } from 'react';

import { createPortal } from 'react-dom';
import { Platform } from 'react-native';

export function ModalOverlay({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return <>{children}</>;
  return createPortal(children, document.body);
}
