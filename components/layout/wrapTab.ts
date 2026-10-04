const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function listFocusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getAttribute('aria-disabled') !== 'true',
  );
}

// Keeps Tab inside the panel by wrapping from its last control to its first and back.
export function wrapTab(event: KeyboardEvent, panel: HTMLElement) {
  const focusable = listFocusable(panel);
  if (focusable.length === 0) {
    // Nothing to move to (every control is disabled): keep focus on the panel.
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  // The panel itself holds focus right after it opens; treat that like being outside the controls.
  const isOutside = active === panel || !panel.contains(active);
  if (event.shiftKey && (active === first || isOutside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || isOutside)) {
    event.preventDefault();
    first.focus();
  }
}
