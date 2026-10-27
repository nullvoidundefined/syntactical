# App Review notes

Paste the text below into App Store Connect (App Review Information, Notes) and the Play Console (App access, instructions). The reviewer signs in with an email and password the owner creates, so no inbox or emailed code is needed during review.

## Reviewer account (owner action)

The app signs in with an email and password as its first step (`app/sign-in.tsx`, `components/auth/PasswordSignInStep.tsx`), and a signed-in user can add or change a password in Settings, Account ("Add a password", `components/auth/PasswordSettingsForm.tsx`).

1. Create the reviewer account on the production API with an email the owner controls (for example `review@<your domain>`): Sign in, then "Create an account" (email and password, confirmed by an emailed code), or sign in with a code and set the password in Settings, Account, "Add a password".
2. Sign in with that email and password once to confirm they work.
3. Enter the email and password in App Store Connect, App Review Information, Sign-in information, and in the Play Console, App content, App access, as the login credentials.

Never put the email or the password in the notes text below. Keep the account signed up and the password unchanged until review is finished.

## Notes text

```
Syntactical is a programming quiz app with 12 tracks (for example Python, Postgres, and Backend Security), each at Easy, Medium, and Hard. Every question bank is free and needs no account.

Syntactical Pro is the only in-app purchase, in two products: syntactical.pro.annual (auto-renewing subscription, one year, in the subscription group "Pro") and syntactical.pro.lifetime (non-consumable). Pro removes the sponsored cards and raises the daily limit of "Ask about this card" from 5 to 20. There is no monthly product.

How to reach Pro:
1. Open the app. The track list shows a card labelled Sponsored between the track groups. When no ad is available it is the house card, "Syntactical Pro", with a See Pro button.
2. Tap See Pro. Or, once signed in, open Settings (reachable from the header on every screen) and tap Go Pro.
3. If you are not signed in, the Syntactical Pro sheet opens without prices, and tapping "A year" or "Forever" sends you to Sign in first. Sign in with the email and password from the sign-in information we provided. The app returns you to the screen you came from; tap See Pro again.
4. The Syntactical Pro sheet shows two buttons with the store prices, "A year for <price>" and "Forever for <price>", and Not now. Buy either one with your sandbox account.
5. The sponsored cards disappear. Settings shows "Pro until <date>" for the annual product or "Pro, lifetime". Settings, Manage subscription opens the store's subscription page. Settings, Restore purchases restores Pro on a new install.

Buying needs a signed-in account because Pro belongs to the account, not to the device or the store account, so it carries across iOS, Android, and the web. Every question bank and the quiz itself work without signing in.

Sponsored cards: a free user sees one card on the results screen after a round (from the third round, then every third round) and one in the track list. They never appear on a question, during a round, in the query drawer, or in review rounds. On iOS and Android the card is a Google AdMob native ad drawn in the app's own card style, with the "Sponsored" label at the top and the AdChoices icon in the top-right corner. When no ad loads, the card is a direct sponsor or the house Pro card. Development and preview builds show only Google test ads labelled "Test Ad"; the production build under review requests real ads.

Ads are non-personalised only. The app does not use the advertising identifier for tracking and does not show the App Tracking Transparency prompt. In the EEA and the UK, Google's consent form (User Messaging Platform) appears on first launch, before any ad request; Settings, Privacy settings reopens it.

Account deletion: Settings, then Account, then Delete account. The app asks you to type DELETE to confirm. Deleting removes the account, synced answers, and progress. Records that remain at vendors are limited to analytics events tied to the account's random user id (never the email), the RevenueCat customer record, the email provider's send log, Google AdMob's records of the sponsored cards it served to the device (not tied to the account), the questions asked about a card and the weekly summaries behind study notes kept by Anthropic, and by OpenAI when a request was sent to it, under their API data-retention terms (they carry no email or user id), and the stores' own transactions.

Data collection: email (sign-in); whether the account has Pro and until when; product analytics through PostHog, anonymous for guests and tied to a random user id (never the email) once signed in, with location lookup turned off; a signed-in user's questions about a card and their weekly study note, sent with the card to Anthropic (primary) or to OpenAI (fallback, only when Anthropic cannot answer) to write the answer, never with the email or user id; and advertising data through Google AdMob on iOS and Android. Google receives the device's IP address, from which it may infer an approximate location, and device information, to serve and count the non-personalised sponsored cards; this data is not linked to the user and not used for tracking. The privacy policy is at https://syntactical.dev/privacy.

Purchases are processed by Apple and Google through RevenueCat. The app never handles card details.
```

The policy page is a draft in the app (`app/privacy.tsx`); the owner fills in its placeholders before submission (see `docs/launch-placeholders.md`).

## Checked against the code

| Claim                                                                                                                                         | Source                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every bank is free; no bank opens a purchase                                                                                                  | `content/manifest.json` (no `access` or `productId` keys)                                                                                                         |
| The track list shows one sponsored card between the category groups for a free user                                                           | `components/menu/LanguageStep.tsx`                                                                                                                                |
| The results screen shows a sponsored card after the Retry and Menu row, from the third round, then every third round                          | `components/quiz/ResultsScreen.tsx`; `SPONSOR.ROUNDS_BETWEEN` in `constants/sponsor.ts`                                                                           |
| The house card reads "Syntactical Pro", "No sponsored cards. 20 asks a day.", "See Pro", and opens the sheet                                  | `HOUSE_CARD` in `constants/sponsor.ts`; `components/sponsor/SponsorProSheetHost.tsx`                                                                              |
| A guest's buy button on the house card's sheet goes to sign-in and back to the same screen                                                    | `components/sponsor/SponsorProSheetHost.tsx`                                                                                                                      |
| The Pro sheet is titled "Syntactical Pro" with "A year for", "Forever for", and "Not now"                                                     | `components/purchase/ProSheet.tsx`                                                                                                                                |
| Settings shows Go Pro, or "Pro until" / "Pro, lifetime", and Manage subscription for a Pro user wherever RevenueCat reports a management page | `components/purchase/ProRow.tsx` (RevenueCat's `managementURL`, read by `state/useSubscriptionManagementUrl.ts`)                                                  |
| Restore purchases appears in Settings for a signed-in user on native only                                                                     | `app/settings.tsx` (`RestorePurchases`, `Platform.OS !== 'web'`)                                                                                                  |
| Ad requests are non-personalised; no ATT prompt                                                                                               | `components/sponsor/SponsoredCard.tsx` (`requestNonPersonalizedAdsOnly: true`); no ATT module in `package.json`                                                   |
| Development and preview builds request only Google test ads                                                                                   | `eas.json` (`ADMOB_USE_TEST_IDS`); `app.config.ts`                                                                                                                |
| UMP consent runs before the first ad request in the EEA and UK; Settings, Privacy settings reopens it                                         | `state/SponsorProvider.tsx` (Task 6.16, "consent and SDK initialisation in `SponsorProvider`, and Privacy settings"); `components/sponsor/PrivacySettingsRow.tsx` |
| The privacy policy names Google AdMob, EthicalAds, Anthropic (primary), and OpenAI (fallback)                                                 | `app/privacy.tsx`; `docs/store/privacy-labels.md`                                                                                                                 |
| Ask allows 5 a day free and 20 with Pro                                                                                                       | `server/src/constants/ask.ts`                                                                                                                                     |
| Delete account is in Settings, behind a type-DELETE confirmation                                                                              | `components/auth/DeleteAccountDialog.tsx`                                                                                                                         |
| The reviewer signs in with an email and password; a password is added or changed in Settings, Account                                         | `app/sign-in.tsx` and `components/auth/PasswordSignInStep.tsx`; `app/sign-up.tsx`; `components/auth/PasswordSettingsForm.tsx` in `app/settings.tsx`               |
| Pro belongs to the account: every platform reads it from `GET /v1/me` (`pro.isActive`), which the RevenueCat webhook sets for the user id     | `state/useProStatus.ts`; `server/src/services/readProfile.ts` (the `hasPro` rule)                                                                                 |
