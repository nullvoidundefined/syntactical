// Difficulty step route for one language; a language the manifest does not
// list shows the not-found screen. A locked paid bank opens its paywall for a
// signed-in user and sends a guest to sign-in first, returning to this route
// with ?paywall=<difficulty>. That param opens the paywall only for a paid bank
// of this language the user does not own (an owned bank shows no paywall).
import { useCallback, useEffect, useState } from 'react';

import { DIFFICULTIES } from '@syntactical/content-schema';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import NotFoundScreen from '../+not-found';
import { DifficultyStep } from '../../components/menu/DifficultyStep';
import { PaywallSheet } from '../../components/purchase/PaywallSheet';
import { useSignedInUserId } from '../../state/AuthProvider';
import { useEntitlements } from '../../state/useEntitlements';
import { useLanguageManifest } from '../../state/useLanguageManifest';
import { usePurchases } from '../../state/usePurchases';

const PURCHASE_FAILED = 'The purchase did not go through. Try again.';
const PURCHASE_PENDING = 'Your purchase is still processing. Check back shortly.';

type SearchParams = { language: string; paywall?: string | string[] };

export default function DifficultyScreen() {
    const { language, paywall } = useLocalSearchParams<SearchParams>();
    const { languages } = useLanguageManifest();
    const userId = useSignedInUserId();
    const entitlements = useEntitlements();
    const { buy, prices } = usePurchases({ shouldLoadPrices: true });
    const [paywallDifficulty, setPaywallDifficulty] = useState<string | null>(null);
    const [isBuying, setIsBuying] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const languageEntry = languages.find(({ id }) => id === language);

    function readPaidProductId(difficultyId: string | string[] | undefined): string | null {
        if (typeof difficultyId !== 'string' || !languageEntry) return null;
        if (!Object.hasOwn(languageEntry.banks, difficultyId)) return null;
        const bank = languageEntry.banks[difficultyId as keyof typeof languageEntry.banks];
        return bank?.access === 'paid' ? (bank.productId ?? null) : null;
    }

    useEffect(() => {
        const productId = readPaidProductId(paywall);
        if (productId !== null && userId !== null) setPaywallDifficulty(paywall as string);
        // Opens only when the param or the signed-in user changes, so closing sticks.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paywall, userId]);

    const closePaywall = useCallback(() => {
        if (isBuying) return;
        setPaywallDifficulty(null);
        setMessage(null);
    }, [isBuying]);

    if (!languageEntry) return <NotFoundScreen />;

    function selectLockedDifficulty(difficultyId: string) {
        if (userId === null) {
            router.push({
                params: { returnTo: `/${language}?paywall=${difficultyId}` },
                pathname: '/sign-in',
            });
            return;
        }
        setPaywallDifficulty(difficultyId);
    }

    async function buyOpenBank(productId: string) {
        setIsBuying(true);
        setMessage(null);
        try {
            const outcome = await buy(productId);
            if (outcome === 'redirect')
                router.push({ params: { product: productId }, pathname: '/purchase-complete' });
            if (outcome === 'unavailable') setMessage(PURCHASE_FAILED);
            if (outcome === 'pending') setMessage(PURCHASE_PENDING);
            if (outcome === 'redirect' || outcome === 'unlocked') setPaywallDifficulty(null);
        } finally {
            setIsBuying(false);
        }
    }

    const paywallProductId = readPaidProductId(paywallDifficulty ?? undefined);
    const isOwned =
        entitlements.status === 'ready' &&
        paywallProductId !== null &&
        entitlements.productIds.has(paywallProductId);
    const paywallLabel = DIFFICULTIES.find(({ id }) => id === paywallDifficulty)?.label ?? '';
    return (
        <ScrollView contentContainerClassName="flex-grow items-center justify-center px-4 py-8">
            <View className="w-full max-w-xl">
                <DifficultyStep
                    language={language}
                    onSelectDifficulty={(difficulty) => router.push(`/${language}/${difficulty}`)}
                    onSelectLockedDifficulty={selectLockedDifficulty}
                    onBack={() => router.replace('/')}
                    prices={prices}
                />
            </View>
            {paywallProductId === null || isOwned ? null : (
                <PaywallSheet
                    difficultyLabel={paywallLabel}
                    isBuying={isBuying}
                    message={message}
                    onBuy={() => void buyOpenBank(paywallProductId)}
                    onClose={closePaywall}
                    price={prices[paywallProductId]}
                />
            )}
        </ScrollView>
    );
}
