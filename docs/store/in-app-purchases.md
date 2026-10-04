# In-app purchase products

Six paid banks, one product each. Medium and Hard are paid for each language; Easy is free (`content/manifest.json`, `access: "paid"`). The ids below are the `productId` values in the manifest and must match exactly in the stores and RevenueCat.

| Product id                      | Language   | Difficulty | Type                      | Price tier | Reference name         | Display name (localized) | Description (localized)                  |
| ------------------------------- | ---------- | ---------- | ------------------------- | ---------- | ---------------------- | ------------------------ | ---------------------------------------- |
| `syntactical.python.medium`     | Python     | Medium     | Non-consumable / one-time | $5         | Python Medium bank     | Python Medium            | The Medium question bank for Python.     |
| `syntactical.python.hard`       | Python     | Hard       | Non-consumable / one-time | $5         | Python Hard bank       | Python Hard              | The Hard question bank for Python.       |
| `syntactical.postgres.medium`   | Postgres   | Medium     | Non-consumable / one-time | $5         | Postgres Medium bank   | Postgres Medium          | The Medium question bank for Postgres.   |
| `syntactical.postgres.hard`     | Postgres   | Hard       | Non-consumable / one-time | $5         | Postgres Hard bank     | Postgres Hard            | The Hard question bank for Postgres.     |
| `syntactical.javascript.medium` | JavaScript | Medium     | Non-consumable / one-time | $5         | JavaScript Medium bank | JavaScript Medium        | The Medium question bank for JavaScript. |
| `syntactical.javascript.hard`   | JavaScript | Hard       | Non-consumable / one-time | $5         | JavaScript Hard bank   | JavaScript Hard          | The Hard question bank for JavaScript.   |

"$5 tier" means the store's $4.99 price point in the US (Apple: Tier 5 equivalent in the price picker; Play: set the default price to 4.99 USD). The owner sets the other regions' prices from the store's own equivalence.

## Per-store setup

- **App Store Connect:** My Apps, Syntactical, Monetization, In-App Purchases, create a Non-Consumable with the product id above, the reference name above, the price, a localized display name and description, and one review screenshot of the paywall. Product ids cannot be reused after deletion, so check them before saving.
- **Play Console:** Monetize, Products, In-app products, create a product with the same id, then activate it. Keep the ids exactly as written.
- **RevenueCat:** add the iOS and Android apps with their store credentials, import the six products, attach each to an Offering package, and make that Offering the **current** offering. The app lists prices and buys through the current offering's packages and finds a package by its store product identifier (`clients/purchaseStoreClient.ts`), so a product missing from the current offering shows as unavailable. For the web, add a Web Billing app, create the same six products (identifiers equal to the ids above), and put them in the same offering.
- **RevenueCat webhook:** point it at `https://api.syntactical.dev/v1/webhooks/revenuecat`, with the `Authorization` header set to the value of `REVENUECAT_WEBHOOK_AUTH` (see `docs/launch-placeholders.md`). A purchase unlocks a bank only when the webhook has recorded the entitlement: the app refetches `/v1/me` after a purchase, and the paid bank is served only to an account with a granted entitlement.

## Review notes for each product

Use the same text for all six, in the product's App Review Information field:

```
A non-consumable unlock of one question bank (<Language> <Difficulty>) in Syntactical. To reach it: open the app, choose <Language>, tap <Difficulty> on the difficulty step, sign in with an emailed one-time code if asked, then tap Buy on the Unlock sheet. After purchase the bank plays. Settings, Restore purchases restores it on a new install.
```

Screenshot for review: the paywall sheet, "Unlock <Difficulty>" with its Buy button, taken on a build with the sandbox price loaded.

## Check before submitting

- Each product's status is "Ready to Submit" (Apple) or "Active" (Play).
- The first in-app purchases must be submitted together with an app version: attach all six on the version's In-App Purchases and Subscriptions section.
- A sandbox purchase on a preview or production build unlocks the bank and `/v1/me` lists the entitlement (`docs/device-checklist.md`).
