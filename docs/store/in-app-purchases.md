# In-app purchase products

One Pro tier, sold two ways: a yearly auto-renewing subscription and a one-time lifetime purchase. There is no monthly product. Pro removes sponsored cards and raises "Ask about this card" from 5 to 20 answers a day. Every question bank is free; nothing else is sold. The ids below must match exactly in App Store Connect, Play Console, RevenueCat, and `constants/proProducts.ts` (both match `PRODUCT_ID_PATTERN` in `constants/appConfig.ts`).

| Product id                 | Plan in the app | Store type                                                                                            | US price | Reference name | Display name (localized)   | Description (localized)                                                   |
| -------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- | -------- | -------------- | -------------------------- | ------------------------------------------------------------------------- |
| `syntactical.pro.annual`   | A year          | Apple: auto-renewable subscription, 1 year, group "Pro". Play: subscription with one yearly base plan | $19.99   | Pro annual     | Syntactical Pro (1 year)   | No sponsored cards and 20 asks a day. Renews every year until you cancel. |
| `syntactical.pro.lifetime` | Forever         | Apple: non-consumable. Play: one-time in-app product                                                  | $39.99   | Pro lifetime   | Syntactical Pro (lifetime) | No sponsored cards and 20 asks a day, for good. One payment.              |

The owner sets the other regions' prices from each store's own equivalence. The app never shows a hard-coded price: the Pro sheet's buttons read "A year for {price}" and "Forever for {price}" from the store's localized strings, and "A year" and "Forever" when no price has loaded.

## Per-store setup

- **App Store Connect:** My Apps, Syntactical, Monetization, Subscriptions. Create a subscription group with the reference name `Pro` and the localized group name "Syntactical Pro". In it, create the auto-renewable subscription `syntactical.pro.annual`: reference name `Pro annual`, duration 1 year, price $19.99, the display name and description above, and one review screenshot of the Pro sheet. Then Monetization, In-App Purchases: create the Non-Consumable `syntactical.pro.lifetime`: reference name `Pro lifetime`, price $39.99, the display name and description above, and the same screenshot. Product ids cannot be reused after deletion, so check them before saving.
- **Play Console:** Monetize, Products, Subscriptions: create the subscription `syntactical.pro.annual` with one base plan, id `yearly`, auto-renewing, billing period 1 year, price 19.99 USD, and activate it. Monetize, Products, In-app products: create `syntactical.pro.lifetime`, price 39.99 USD, and activate it.
- **RevenueCat:** add the iOS and Android apps with their store credentials and import both products from each store. Create one offering, `default`, and make it the **current** offering, with two packages: `$rc_annual` holding `syntactical.pro.annual` (on Android the `yearly` base plan) and `$rc_lifetime` holding `syntactical.pro.lifetime`. The app lists prices and buys through the current offering's packages and finds a package by its store product identifier (`clients/purchaseStoreClient.ts`), with a Play subscription's base-plan suffix stripped first (RevenueCat reports the annual on Android as `syntactical.pro.annual:yearly`; `clients/normalizeProductId.ts`, the same rule the server applies to webhook product ids), so a product missing from the current offering shows no price and its purchase is unavailable. For the web, add a Web Billing app, create the same two products with identifiers equal to the ids above (the annual as a 1-year subscription, the lifetime as a one-time purchase), and put them in the same two packages. No RevenueCat entitlement is needed: the server decides Pro from the product ids in webhook events.
- **RevenueCat webhook:** point it at `https://api.syntactical.dev/v1/webhooks/revenuecat`, with the `Authorization` header set to the value of `REVENUECAT_WEBHOOK_AUTH` (see `docs/launch-placeholders.md`). Pro shows only once the webhook has recorded the purchase: the app refetches `/v1/me` after a purchase and shows Pro when `pro.isActive` is true. A cancelled annual keeps Pro until its expiry; only the expiry or a refund ends it. Sandbox purchases grant Pro only on the staging API (`REVENUECAT_ACCEPT_SANDBOX=true` there; production records a sandbox event and grants nothing), so every sandbox check below uses a preview build, which points at `https://staging-api.syntactical.dev/v1/` (`eas.json`).

## Review notes

Use this text in each product's App Review Information field:

```
Syntactical Pro removes the sponsored cards and raises "Ask about this card" from 5 to 20 answers a day. Every question bank is free without it. To reach the purchase: open the app, tap Settings in the header, sign in with an emailed one-time code if asked, then tap Go Pro. The sheet titled "Syntactical Pro" offers "A year for <price>", an auto-renewing yearly subscription, and "Forever for <price>", a one-time purchase, and says that the year renews until cancelled. After purchase, Settings shows "Pro until <date>" or "Pro, lifetime". For the yearly plan, Settings, Manage subscription opens the subscription page RevenueCat reports for the account (the store's own page). Settings, Restore purchases restores Pro on a new install, and says "No purchases to restore on this account." when the signed-in account has none. The same sheet opens from "See Pro" when a free account reaches its 5 asks for the day.
```

Screenshot for review: the Pro sheet, "Syntactical Pro" with both buttons showing the sandbox prices.

## Check before submitting

- Both products are "Ready to Submit" (Apple) or "Active" (Play), and the subscription group has its localized name.
- The first subscription and in-app purchase must be submitted with an app version: attach both on the version's In-App Purchases and Subscriptions section.
- A sandbox purchase of each product on a preview build (staging API) makes `/v1/me` report `pro.isActive: true` with the matching `product`, and Settings shows the plan (`docs/device-checklist.md`).
- A sandbox refund of the annual (App Store Connect sandbox or the Play Console order page) makes the staging `/v1/me` report `pro.isActive: false`, and Settings shows Go Pro again.
