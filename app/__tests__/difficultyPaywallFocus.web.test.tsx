// PR #52 review finding on the web (IAN-601), RED: while a Web Billing purchase
// is in flight (the sheet's Buy and "Not now" turn busy), focus stays inside the
// paywall dialog. The sheet's focus effect must not hand focus back to the
// locked-bank trigger mid-purchase, not even for a moment.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import {
    CONTENT_BASE_URL,
    MEDIUM_PRODUCT,
    SIGNED_IN_USER,
    WEB_PRICES,
    fakeAuth,
    resetFakes,
    serveApp,
    webBilling,
} from '../../components/purchase/__tests__/purchaseFlowFakes';
import { createQueryClient } from '../../config/queryClient';
import { ContentProvider } from '../../state/ContentProvider';
import DifficultyScreen from '../[language]/index';

const mockParams: { current: Record<string, string | string[] | undefined> } = {
    current: { language: 'python' },
};

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
jest.mock('../../state/useIsReducedMotion', () => ({ useIsReducedMotion: () => false }));
jest.mock('../../clients/analyticsClient', () => ({ trackEvent: () => undefined }));

const MEDIUM_LOCKED = `Medium, locked, ${WEB_PRICES[MEDIUM_PRODUCT]}`;

let queryClient: QueryClient;

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
    });
}

beforeEach(() => {
    resetFakes();
    queryClient = createQueryClient();
    mockParams.current = { language: 'python' };
    fakeAuth.userId = SIGNED_IN_USER;
    serveApp();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
    await settle();
    queryClient.clear();
    jest.restoreAllMocks();
});

describe('paywall focus during a web purchase (RED)', () => {
    it('keeps focus inside the dialog while the purchase is in flight and never returns it to the trigger', async () => {
        let releasePurchase: () => void = () => undefined;
        webBilling.purchaseGate = new Promise<void>((resolve) => {
            releasePurchase = resolve;
        });
        render(
            <QueryClientProvider client={queryClient}>
                <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>
                    <DifficultyScreen />
                </ContentProvider>
            </QueryClientProvider>,
        );
        await settle();

        // The keyboard user focuses the locked bank and activates it.
        const trigger = await screen.findByRole('button', { name: MEDIUM_LOCKED });
        act(() => trigger.focus());
        await act(async () => {
            fireEvent.click(trigger);
        });
        const dialog = await screen.findByRole('dialog');
        expect(dialog.contains(document.activeElement)).toBe(true);

        const buy = within(dialog).getByRole('button', { name: /^Buy\b/ });
        act(() => buy.focus());
        const focusTargets: Element[] = [];
        function recordFocus(event: FocusEvent) {
            focusTargets.push(event.target as Element);
        }
        document.addEventListener('focusin', recordFocus);
        try {
            await act(async () => {
                fireEvent.click(buy);
            });
            await settle();

            // In flight: Buy is busy and the store call has not returned.
            expect(webBilling.purchasedProductIds).toEqual([MEDIUM_PRODUCT]);
            const busyBuy = within(screen.getByRole('dialog')).getByRole('button', {
                name: /^Buy\b/,
            });
            expect(busyBuy.getAttribute('aria-disabled')).toBe('true');

            expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
            expect(
                focusTargets.filter((target) => !screen.getByRole('dialog').contains(target)),
            ).toEqual([]);
            expect(focusTargets).not.toContain(trigger);
        } finally {
            document.removeEventListener('focusin', recordFocus);
            releasePurchase();
            await settle();
        }
    });
});
