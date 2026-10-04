// Task 3.18 RED (B-42, B-64, security boundary) on the web: a paid bank
// without its entitlement is named with the Web Billing offering's localized
// price; Buy purchases the bank's package through the webBillingClient wrapper
// and then routes to /purchase-complete for that product, never unlocking the
// bank itself; a cancelled or unavailable purchase routes nowhere. The paywall
// is a modal dialog with exactly one h1, traps Tab focus, closes on Escape,
// has no axe violations, and its slide is disabled under reduced motion.
// Real DifficultyStep, useQuestionBank, useEntitlements, usePurchases, and
// PaywallSheet; Web Billing, the server (a routed fetch), auth, the router,
// and analytics are fakes.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import {
    CONTENT_BASE_URL,
    HARD_PRODUCT,
    MEDIUM_PRODUCT,
    SIGNED_IN_USER,
    WEB_PRICES,
    fakeAuth,
    listNavigatedUrls,
    resetFakes,
    serveApp,
    webBilling,
} from '../../components/purchase/__tests__/purchaseFlowFakes';
import { createQueryClient } from '../../config/queryClient';
import { ContentProvider } from '../../state/ContentProvider';
import DifficultyScreen from '../[language]/index';

expect.extend(toHaveNoViolations);

const mockParams: { current: Record<string, string | string[] | undefined> } = {
    current: { language: 'python' },
};
const mockMotion = { isReduced: false };
const mockTrackEvent = jest.fn();

jest.mock('expo-constants', () => ({
    expoConfig: {
        extra: {
            apiBaseUrl: 'https://api.syntactical.dev/v1/',
            contentBaseUrl: 'https://example.test/content/',
        },
    },
}));
jest.mock('../../clients/hashClient', () => ({
    hashTextSha256: async (text: string) =>
        require('crypto').createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
}));
jest.mock('../../clients/webBillingClient', () =>
    require('../../components/purchase/__tests__/purchaseFlowFakes').buildWebBillingModule(),
);
jest.mock('../../state/AuthProvider', () =>
    require('../../components/purchase/__tests__/purchaseFlowFakes').buildAuthModule(),
);
jest.mock('expo-router', () =>
    require('../../components/purchase/__tests__/purchaseFlowFakes').buildRouterModule(
        () => mockParams.current,
    ),
);
jest.mock('../../state/useIsOnline', () => ({ useIsOnline: () => true }));
jest.mock('../../state/useIsReducedMotion', () => ({
    useIsReducedMotion: () => mockMotion.isReduced,
}));
// analyticsClient lands from a parallel PR; virtual until then.
jest.mock(
    '../../clients/analyticsClient',
    () => ({ trackEvent: (...args: unknown[]) => mockTrackEvent(...args) }),
    { virtual: true },
);

// jsdom computes no layout or colors, so axe cannot judge contrast here.
const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };
const MEDIUM_LOCKED = `Medium, locked, ${WEB_PRICES[MEDIUM_PRODUCT]}`;
const HARD_LOCKED = `Hard, locked, ${WEB_PRICES[HARD_PRODUCT]}`;
const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

let queryClient: QueryClient;

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
    });
}

async function renderDifficultyRoute() {
    const rendered = render(
        <QueryClientProvider client={queryClient}>
            <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>
                <DifficultyScreen />
            </ContentProvider>
        </QueryClientProvider>,
    );
    await settle();
    return rendered;
}

async function openMediumPaywall(): Promise<HTMLElement> {
    const medium = await screen.findByRole('button', { name: MEDIUM_LOCKED });
    await act(async () => {
        fireEvent.click(medium);
    });
    return screen.findByRole('dialog');
}

async function pressBuy(dialog: HTMLElement): Promise<void> {
    await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: /^Buy\b/ }));
    });
    await settle();
}

function listFocusable(dialog: HTMLElement): HTMLElement[] {
    return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.getAttribute('aria-disabled') !== 'true',
    );
}

function readPanelStyle(): CSSStyleDeclaration {
    return screen.getByTestId('paywall-sheet-panel').style;
}

function hasNoMotion(style: CSSStyleDeclaration): boolean {
    const isAnimationOff =
        /^none/.test(style.animation) ||
        style.animationName === 'none' ||
        (style.animation === '' && style.animationName === '');
    const isTransitionOff =
        /^none/.test(style.transition) ||
        style.transitionProperty === 'none' ||
        (style.transition === '' && style.transitionProperty === '');
    return isAnimationOff && isTransitionOff;
}

function isSliding(style: CSSStyleDeclaration): boolean {
    const animationName = style.animationName || style.animation;
    const hasAnimation = animationName !== '' && !/^none/.test(animationName);
    const hasTransformTransition = /transform|translate|all/.test(
        style.transitionProperty || style.transition,
    );
    return hasAnimation || hasTransformTransition;
}

beforeEach(() => {
    resetFakes();
    queryClient = createQueryClient();
    mockParams.current = { language: 'python' };
    mockMotion.isReduced = false;
    fakeAuth.userId = SIGNED_IN_USER;
    serveApp();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
    await settle();
    queryClient.clear();
    jest.restoreAllMocks();
});

describe('difficulty route paywall on the web', () => {
    it('names each locked paid bank with the Web Billing offering price', async () => {
        await renderDifficultyRoute();
        expect(await screen.findByRole('button', { name: MEDIUM_LOCKED })).toBeTruthy();
        expect(screen.getByRole('button', { name: HARD_LOCKED })).toBeTruthy();
    });

    it('opens the paywall on selecting a locked bank and records paywall_viewed exactly once', async () => {
        await renderDifficultyRoute();
        const dialog = await openMediumPaywall();
        expect(
            within(dialog).getByText(new RegExp(WEB_PRICES[MEDIUM_PRODUCT].replace('.', '\\.'))),
        ).toBeTruthy();
        await settle();
        expect(
            mockTrackEvent.mock.calls.filter(([name]) => name === 'paywall_viewed'),
        ).toHaveLength(1);
    });

    it('Buy purchases the bank package through Web Billing, then routes to /purchase-complete for that product, without unlocking the bank itself', async () => {
        await renderDifficultyRoute();
        const dialog = await openMediumPaywall();
        await pressBuy(dialog);
        expect(webBilling.purchasedProductIds).toEqual([MEDIUM_PRODUCT]);
        await waitFor(() =>
            expect(listNavigatedUrls().map(({ pathname }) => pathname)).toContain(
                '/purchase-complete',
            ),
        );
        const complete = listNavigatedUrls().find(
            ({ pathname }) => pathname === '/purchase-complete',
        );
        expect(complete?.searchParams.get('product')).toBe(MEDIUM_PRODUCT);
        // The server has not granted it, so the bank stays locked here.
        expect(screen.getByRole('button', { name: MEDIUM_LOCKED, hidden: true })).toBeTruthy();
    });

    it.each(['cancelled', 'unavailable'] as const)(
        'a %s Web Billing purchase routes nowhere and unlocks nothing',
        async (outcome) => {
            webBilling.purchaseBehavior = outcome;
            await renderDifficultyRoute();
            const dialog = await openMediumPaywall();
            await pressBuy(dialog);
            expect(webBilling.purchasedProductIds).toEqual([MEDIUM_PRODUCT]);
            await settle();
            expect(listNavigatedUrls().map(({ pathname }) => pathname)).not.toContain(
                '/purchase-complete',
            );
            expect(screen.getByRole('button', { name: MEDIUM_LOCKED, hidden: true })).toBeTruthy();
        },
    );

    describe('paywall accessibility (B-64)', () => {
        it('is a modal dialog with exactly one h1 and no axe violations', async () => {
            const { container } = await renderDifficultyRoute();
            const dialog = await openMediumPaywall();
            expect(dialog.getAttribute('aria-modal')).toBe('true');
            expect(within(dialog).getAllByRole('heading', { level: 1 })).toHaveLength(1);
            expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
        });

        it('moves focus into the dialog and wraps Tab and Shift+Tab inside it', async () => {
            await renderDifficultyRoute();
            const dialog = await openMediumPaywall();
            await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
            const focusable = listFocusable(dialog);
            expect(focusable.length).toBeGreaterThan(0);
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

        it('closes on Escape without purchasing', async () => {
            await renderDifficultyRoute();
            const dialog = await openMediumPaywall();
            await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
            await act(async () => {
                fireEvent.keyDown(document.activeElement ?? dialog, {
                    key: 'Escape',
                    code: 'Escape',
                });
            });
            await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
            expect(webBilling.purchasedProductIds).toEqual([]);
            expect(screen.getByRole('button', { name: MEDIUM_LOCKED })).toBeTruthy();
        });

        it('slides in when motion is allowed', async () => {
            await renderDifficultyRoute();
            await openMediumPaywall();
            expect(isSliding(readPanelStyle())).toBe(true);
        });

        it('has no slide animation or transition under reduced motion', async () => {
            mockMotion.isReduced = true;
            await renderDifficultyRoute();
            await openMediumPaywall();
            const style = readPanelStyle();
            expect(hasNoMotion(style)).toBe(true);
            expect(isSliding(style)).toBe(false);
        });
    });
});
