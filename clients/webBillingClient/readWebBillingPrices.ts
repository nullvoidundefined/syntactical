// The Web Billing offering's localized price strings, keyed by the bank's
// product id. Empty when Web Billing is not configured or the offering cannot
// be read, so a caller shows no price rather than a made-up one.
import { logWarning } from '../logClient';

import { webBillingState } from './webBillingState';

export async function readWebBillingPrices(): Promise<Record<string, string>> {
    const current = webBillingState.current;
    if (current === null) return {};
    try {
        const offerings = await current.instance.getOfferings();
        const prices: Record<string, string> = {};
        for (const { webBillingProduct } of offerings.current?.availablePackages ?? []) {
            prices[webBillingProduct.identifier] = webBillingProduct.currentPrice.formattedPrice;
        }
        return prices;
    } catch {
        logWarning({ err: new Error('web billing prices unavailable') }, 'web prices unavailable');
        return {};
    }
}
