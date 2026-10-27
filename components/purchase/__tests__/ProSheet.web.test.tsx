// components/purchase/__tests__/ProSheet.web.test.tsx
// The Pro sheet on the web: an aria-modal dialog named "Syntactical Pro" with exactly one h1 and no
// axe violations (color-contrast off: jsdom computes no colors; Lighthouse covers it); focus moves
// into it, Tab and Shift+Tab wrap inside it, and it stays inside while a purchase runs; Escape
// closes it; it slides in unless motion is reduced; quiz keys are inert while it is open; and with
// no prices and no Web Billing key it says Pro is in the mobile apps instead of offering buttons.
import { randomBytes } from 'node:crypto';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { setExpoExtra } from '../../../config/expoConstantsMock';
import { isModalOpen } from '../../../state/modalOpenSignal';
import { ProSheet } from '../ProSheet';

expect.extend(toHaveNoViolations);

const mockMotion = { isReduced: false };
jest.mock('../../../state/useIsReducedMotion', () => ({ useIsReducedMotion: () => mockMotion.isReduced }));
jest.mock('../../../clients/analyticsClient', () => ({ trackEvent: jest.fn() }));

const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const PRICES = { 'syntactical.pro.annual': '£17.49', 'syntactical.pro.lifetime': '£34.99' };
const WEB_UNAVAILABLE = 'Pro is available in the iOS and Android apps for now.';

// Built at run time so no credential-shaped literal sits in source.
function buildWebBillingKey(): string {
  return `rcb_${randomBytes(12).toString('hex')}`;
}

function buildProps(overrides: Record<string, unknown> = {}) {
  return {
    isBuying: false,
    message: null,
    onBuy: jest.fn(),
    onClose: jest.fn(),
    prices: PRICES,
    source: 'settings' as const,
    ...overrides,
  };
}

function listFocusable(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getAttribute('aria-disabled') !== 'true',
  );
}

function readPanelStyle(): CSSStyleDeclaration {
  return screen.getByTestId('pro-sheet-panel').style;
}

function isSliding(style: CSSStyleDeclaration): boolean {
  const animationName = style.animationName || style.animation;
  return animationName !== '' && !/^none/.test(animationName);
}

beforeEach(() => {
  mockMotion.isReduced = false;
  setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/', revenueCatWebBillingKey: buildWebBillingKey() });
});

describe('ProSheet on the web', () => {
  it('is an aria-modal dialog named "Syntactical Pro" with one h1 and no axe violations', async () => {
    const { container } = render(<ProSheet {...buildProps()} />);
    const dialog = screen.getByRole('dialog', { name: 'Syntactical Pro' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await axe(container.ownerDocument.body, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('moves focus into the dialog and wraps Tab and Shift+Tab inside it', async () => {
    render(<ProSheet {...buildProps()} />);
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    const focusable = listFocusable(dialog);
    expect(focusable.length).toBeGreaterThan(2);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    act(() => last.focus());
    await act(async () => {
      fireEvent.keyDown(last, { key: 'Tab', code: 'Tab' });
    });
    expect(document.activeElement).toBe(first);

    act(() => first.focus());
    await act(async () => {
      fireEvent.keyDown(first, { key: 'Tab', code: 'Tab', shiftKey: true });
    });
    expect(document.activeElement).toBe(last);
  });

  it('keeps focus inside the dialog when a purchase starts and the buttons turn busy', async () => {
    const props = buildProps();
    const { rerender } = render(<ProSheet {...props} />);
    const dialog = screen.getByRole('dialog');
    const annual = within(dialog).getByRole('button', { name: 'A year for £17.49' });
    act(() => annual.focus());
    const focusTargets: Element[] = [];
    function recordFocus(event: FocusEvent) {
      focusTargets.push(event.target as Element);
    }
    document.addEventListener('focusin', recordFocus);
    try {
      rerender(<ProSheet {...props} isBuying />);
      const busy = within(screen.getByRole('dialog')).getByRole('button', { name: 'A year for £17.49' });
      expect(busy.getAttribute('aria-disabled')).toBe('true');
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
      expect(focusTargets.filter((target) => !screen.getByRole('dialog').contains(target))).toEqual([]);
    } finally {
      document.removeEventListener('focusin', recordFocus);
    }
  });

  it('closes on Escape without buying', async () => {
    const props = buildProps();
    render(<ProSheet {...props} />);
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape', code: 'Escape' });
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onBuy).not.toHaveBeenCalled();
  });

  it('counts as an open modal while mounted, so quiz keys are inert', () => {
    expect(isModalOpen()).toBe(false);
    const { unmount } = render(<ProSheet {...buildProps()} />);
    expect(isModalOpen()).toBe(true);
    unmount();
    expect(isModalOpen()).toBe(false);
  });

  it('slides in when motion is allowed and does not under reduced motion', () => {
    const { unmount } = render(<ProSheet {...buildProps()} />);
    expect(isSliding(readPanelStyle())).toBe(true);
    unmount();
    mockMotion.isReduced = true;
    render(<ProSheet {...buildProps()} />);
    expect(isSliding(readPanelStyle())).toBe(false);
  });

  it('says Pro is in the mobile apps, with no buy button, when there are no prices and no Web Billing key', () => {
    setExpoExtra({ apiBaseUrl: 'https://api.syntactical.dev/v1/' });
    render(<ProSheet {...buildProps({ prices: {} })} />);
    expect(screen.getByText(WEB_UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^(A year|Forever)/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
  });

  it('offers "A year" and "Forever" when a Web Billing key is set but prices have not loaded', () => {
    render(<ProSheet {...buildProps({ prices: {} })} />);
    expect(screen.getByRole('button', { name: 'A year' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Forever' })).toBeTruthy();
    expect(screen.queryByText(WEB_UNAVAILABLE)).toBeNull();
  });
});
