# Free content, Pro, and sponsored cards

Date: 2026-10-27. Status: approved in conversation (the five owner decisions below), pending spec review.

Audit: `docs/audits/2026-10-27-monetization-marketing.md` holds the reasoning and the numbers. This document is the design; `docs/superpowers/plans/2026-10-27-free-content-pro-sponsored.md` is the task-by-task plan.

## Intent

Syntactical sells nothing today and hides two thirds of its catalogue behind 24 per-bank purchases that cannot be bought. The owner decided on 2026-10-27:

1. Every bank is free. The 24 Medium and Hard banks move out of the private `syntactical-content` repo into this one and are served like the Easy banks.
2. One Pro tier, sold as an annual subscription and a lifetime purchase, never monthly. Pro removes sponsored cards and raises the Ask limit.
3. Sponsored cards for free users on the web and on mobile, every one rendered inside the app's own card component. Mobile cards are AdMob native ads, non-personalised; web cards are EthicalAds text ads, a direct sponsor, or the house Pro card. Never AdSense, never a network-rendered unit.
4. The web app moves from GitHub Pages to Cloudflare Pages and the Expo export switches to static output with crawlable pages.
5. The server's model calls fail over between Anthropic and OpenAI, and survive a model being retired or replaced (section 6).

Success means: a new user can play all 36 banks without an account; a signed-in user can buy Pro on iOS, Android, and the web and see the cards disappear and the Ask limit rise; a lapsed annual returns to the free tier cleanly; the web deploys to `syntactical.dev` from Cloudflare with one HTML file per route; the privacy policy, labels, listing, and review notes describe what ships; Ask and the study note keep answering when one model vendor is down or a configured model is retired.

## 1. Content: every bank free

### Files and manifest

- The 24 private banks are imported as `content/<track>/medium.json` and `content/<track>/hard.json` through one content PR, after which the private repo is archived. `content/paid-content.ref` is deleted.
- `BankEntry` (`packages/content-schema/src/types/BankEntry.ts`) loses `access` and `productId`. `findBankEntryProblem.ts:16-20` and `validateManifest.ts:32-33` drop the paid rule and instead reject an entry that still carries either key, naming it. The manifest stays at `schemaVersion: 2`: the retired-key rule already rejects a stale manifest, and an old client already rejects the new shape, so a version bump would buy nothing. The change lands expand first (both keys optional and ignored) and contract last (the rejection), so CI is green after every step.
- `content/manifest.json` loses the 24 `productId` lines and every `access` key. The 64 KiB manifest cap (`contentLimits.ts:45`) is untouched; the manifest shrinks.

### Build and bundle

- `scripts/buildContentManifest.mjs` loses `contentRoot`, `pickBankDir`, `assertBanksInTheirTrees`, and the paid branches of `hashAllBanks` and bundling. Every bank in `content/` is hashed.
- Only Easy banks stay bundled (`services/content/bundledBanks.generated.ts`). Medium and Hard are downloaded from `contentBaseUrl` on first use and cached, the path `loadQuestionBank.ts:85-88` already takes for a non-bundled free bank. Offline without a cached copy shows "Needs a connection to load", which `DifficultyStep` already renders. Bundle size stays at about 2.2 MB instead of 6.5 MB.
- Cached Medium and Hard banks share the device's key-value store with the learner's stats, so a `bankStore` caps them at six with least-recently-used eviction; a stats write never fails for lack of space. Reviews also see banks downloaded this session, and the background refresh fetches banks named by due review items.
- `scripts/assertNoPaidBanks.mjs` and the `package.json` build step that runs it are deleted, together with `scripts/__tests__/publicContentTree.test.ts`, `paidContentRef.test.ts`, `noPaidQuestionIds.test.ts`, `buildContentManifestPaidSplit.test.ts`, and `buildContentManifestPaidRoot.test.ts`. The drift check in CI (`content:build && git diff --exit-code`) stays.

### App

- `state/useQuestionBank.ts` loses the `locked` state, the entitlement check, the owner-scoped cache, and `describeMissingPaidBank`. `services/content/loadQuestionBank.ts` loses the `apiFetch('banks/...')` branch. `state/PaidBankPrefetch.tsx` and `services/content/prefetchPaidBanks.ts` are deleted; `prefetchChangedBanks.ts` stops skipping anything. `services/content/buildBankQuery.ts` drops the owner from the key.
- `app/[language]/index.tsx` and `components/menu/DifficultyStep.tsx` stop reading `access` and `productId` and stop opening a paywall. The `?paywall=` param is retired.

### Server and deploy

- `GET /v1/banks/:language/:difficulty`, `routes/banksDeps.ts`, `types/PaidBank.ts`, `types/PaidBanks.ts`, `services/readServerBank.ts`, `assertPaidDirSeparate.ts`, the paid branches of `readServerQuestions.ts`, `readServerManifest.ts`, and `readBankBytes.ts`, and `PAID_CONTENT_DIR` in `config/env.ts` are deleted. The server keeps reading the public content tree for Ask and the study note.
- `server/scripts/stageBuildContent.sh` collapses to copying public content; `fetchPinnedCommit.sh` is deleted; `copyContent.mjs` loses the paid tier; the `Dockerfile`, `Dockerfile.dockerignore`, `deployToRailway.sh`, `.github/workflows/server.yml`, `server-deploy.yml`, and `.github/actions/check-api-image/action.yml` lose `CONTENT_DEPLOY_KEY` and `build/paid-content`. `server/ci-fixture/paid/` is deleted and its manifest entry moves to public.
- Pipeline: `--content-root`, `SYNTACTICAL_CONTENT_ROOT`, `assertContentRootUsable.ts`, `hasPaidBanks.ts`, the paid routing in `resolveBankFile.ts` and `resolveBankOutputRoot.ts`, the `publish.ts` guard, and `enrich --free-only` are removed. `apply-staging` covers all 36 banks.

## 2. Pro

### Products

| Product id                 | Store type                                  | Price (US) | Entitlement row   |
| -------------------------- | ------------------------------------------- | ---------- | ----------------- |
| `syntactical.pro.annual`   | Auto-renewing subscription, one-year period | $19.99     | `expires_at` set  |
| `syntactical.pro.lifetime` | Non-consumable                              | $39.99     | `expires_at` NULL |

Both ids match `PRODUCT_ID_PATTERN` (`constants/appConfig.ts:45`), so `app/purchase-complete.tsx` keeps working. RevenueCat holds one offering with two packages (`$rc_annual`, `$rc_lifetime`); the client finds a package by product id as it does today (`clients/purchaseStoreClient.ts:30`).

### Server

- Migration: `entitlements` gains `expires_at timestamptz NULL`. The `(user_id, product_id)` key stays, so the annual and lifetime rows are independent and an annual `EXPIRATION` can never touch a lifetime grant.
- `hasPro(database, userId, now)`: a `granted` row for either Pro product with `expires_at IS NULL OR expires_at > now`. It replaces `hasEntitlement` and `hasAnyEntitlement`.
- `constants/revenueCatEvents.ts`: grant on `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `NON_RENEWING_PURCHASE`; revoke on `EXPIRATION`, `REFUND`, and a `CANCELLATION` whose `cancel_reason` is `CUSTOMER_SUPPORT` (how RevenueCat reports a store refund); any other `CANCELLATION` on the annual product only updates `expires_at` (auto-renew off, access continues), and on the lifetime product it revokes as today; `SUBSCRIPTION_EXTENDED` updates `expires_at`; `TRANSFER` moves the purchase events from the old user to the new one and recomputes both, so restore onto another account works. The intake reads the event type first and answers 200 to any other type without validating the rest. Per-product rules live in one `PRO_PRODUCT_RULES` table. A `SANDBOX` event is recorded but grants nothing unless `REVENUECAT_ACCEPT_SANDBOX` is set, which only staging sets. `expiration_at_ms` joins `PAYLOAD_KEYS` and `revenueCatSchemas.ts` as optional. `recomputeEntitlement.ts` carries the latest event's expiry into the row. `webhookDeps.ts` takes `PRO_PRODUCT_IDS` from a constant, not from the paid banks.
- `types/Profile.ts`: `entitlements: string[]` becomes `pro: { isActive: boolean; expiresAt: string | null; product: 'annual' | 'lifetime' | null }`. `readProfile.ts` computes it with the same rule as `hasPro`.
- Ask: `constants/ask.ts` becomes `DAILY_LIMIT: { FREE: 5, PRO: 20 }`. `routes/ask.ts` drops the 403 entitlement gate, keeps the session requirement (usage is counted per user, and sign-in is the funnel), and picks the limit by `hasPro` before `reserveAskUsage`. The 200 and the 429 carry `tier: 'free' | 'pro'`, `limit`, `proLimit`, and, on a 200, `remaining`, so the app's copy never hard-codes the numbers.
- Admin: `PUT /v1/admin/access` takes `{ isGranted }` and grants or revokes an `admin`-source row on `syntactical.pro.lifetime` with no expiry; a `revenuecat`-source grant still wins. `listAdminAccess` returns one entry.

### App

- `state/useEntitlements.ts` becomes `useProStatus`, reading `data.pro` under the same React Query key root so `useAdminAccess` invalidation keeps working. `ready` carries `{ isPro, expiresAt, product }`.
- `components/purchase/PaywallSheet.tsx` becomes `ProSheet`: the same dialog shell and focus trap, title "Syntactical Pro", two benefits (no sponsored cards, 20 asks a day), two buttons with the store's localized prices ("A year for {price}", "Forever for {price}"), and "Not now". It fires `paywall_viewed` with `source`.
- Entry points: Settings ("Go Pro" row, or "Pro until {date}" / "Pro, lifetime" when active, with "Manage subscription" opening RevenueCat's `managementURL` on every platform, the web included), the house sponsored card, and the Ask limit message. The results screen has no separate Pro footer: its sponsored card is the house Pro card whenever no ad fills it.
- `state/usePurchases.ts`: `confirm` resolves when `pro.isActive` is true; `purchase_completed` is kept and `pro_purchased` fires beside it with `product`.
- `app/purchase-complete.tsx` copy becomes "You're Pro". `app/settings.tsx` keeps "Restore purchases" on native.
- `state/useCanAsk.ts` returns "signed in". `AskPanel.tsx` drops the `locked` copy; the `limit` copy for a free user says "5 a day on the free tier. Pro has 20." with a Go Pro action. `services/ask/requestAskAnswer.ts` drops the 403 mapping.
- `app/admin.tsx` and `state/useAdminAccess.ts` become a single Pro toggle.

## 3. Sponsored cards

### Component

`components/sponsor/SponsoredCard.tsx` (iOS, Android) and `SponsoredCard.web.tsx` (web), the first platform-split component in the repo. Both render the `SelectionCard` idiom (`components/menu/SelectionCard.tsx:22` classes) with:

- a "Sponsored" eyebrow in the mono uppercase label style, at least 15 points high, at the top of the card (AdMob's attribution rule);
- a headline, one line of body text, an optional small icon on the left, and one button;
- no media view, no video, no second line of body;
- `accessibilityRole="link"` on the button and an `aria-label` that starts with "Sponsored:".

A `SponsorContent` type carries `{ headline, body, iconUri?, callToAction, href?, source: 'admob' | 'ethicalads' | 'house' }`. The house card is a constant: headline "Syntactical Pro", body "No sponsored cards. 20 asks a day.", button "See Pro", and it opens `ProSheet`.

### Placement and cap

- Results screen: after the Retry and Menu row in `components/quiz/ResultsScreen.tsx`, shown when the user is not Pro and at least `SPONSOR.ROUNDS_BETWEEN` (3) rounds have completed since the last card, so the first card comes on the third round. The counters live in AsyncStorage beside the stats. The slot is a fixed-height frame reserved as soon as eligibility is known, decided from a cadence value read when the round starts, so nothing moves under the learner's finger when an ad fills.
- Track list: one card between the category groups in `components/menu/LanguageStep.tsx`, outside the number-key ordering, shown whenever the user is not Pro.
- Never on the question card, never mid-round, never in the query drawer, never in review rounds.
- Both constants live in `constants/appConfig.ts`.

### Mobile feed (AdMob native, non-personalised)

- Library: `react-native-google-mobile-ads` (17.x; peer `react-native >= 0.86`, which the project meets). Its Expo config plugin takes the AdMob app ids and the SKAdNetwork list; `expo-dev-client` is added because the SDK needs a development build, which the `development` EAS profile already expects.
- Consent and init: a `SponsorProvider` inside `AuthProvider` in `app/_layout.tsx` runs the UMP consent flow on first launch in the EEA and UK, then initialises the SDK, and exposes `{ isReady, isPro }`. Requests set `requestNonPersonalizedAdsOnly: true`, so no ATT prompt is shown and the privacy label stays "not used for tracking". Settings gains a "Privacy settings" row that reopens the consent form when UMP reports privacy options are required.
- Rendering: an app-owned `useSponsorNativeAd` hook creates the ad with `NativeAd.createForAdRequest(adUnitId, { requestNonPersonalizedAdsOnly: true, adChoicesPlacement: TOP_RIGHT })`, destroys a late ad and the held ad on unmount, and renders it inside `NativeAdView`; each asset is wrapped in `NativeAsset` with `HEADLINE`, `BODY`, `ICON`, `CALL_TO_ACTION`, with no touchable wrappers inside the assets. The top-right corner of the card is kept clear of text so the AdChoices icon stays visible. No ad or a load error renders the house card instead.
- Ad unit ids and app ids are public and go in `app.config.ts` `extra` behind `readPublicKey`-style validation (`ca-app-pub-` prefix); a missing id means the house card everywhere, so a build without AdMob keys still works.

### Web feed (EthicalAds, direct sponsor, house)

- `SponsoredCard.web.tsx` renders a `<div data-ea-publisher data-ea-type="text" data-ea-manual="true" class="dark flat">` inside the card and calls `ethicalads.load()` on mount and `ethicalads.reload()` on route change. The `--ea-` custom properties are set from the app's colour tokens so the ad text uses the card's background, ink, and signal colours. No page carries the client script: an eligible card with a publisher id injects it (async, once per page) and waits for `window.ethicalads` within the fill ceiling, so a Pro viewer's browser never contacts EthicalAds and the app bundle is never queued behind it.
- Until a publisher id exists, or when the client reports no ad, the card renders the house card or a direct sponsor read from a small `content/sponsor.json` (headline, body, href, icon, start and end dates), which the content build validates and copies with the rest of `content/`.
- EthicalAds sets no cookies, so no consent banner is added on the web.

### Analytics

`constants/analyticsEvents.ts` gains `ad_shown`, `ad_clicked` (properties `placement: 'results' | 'tracks'`, `source`), and `pro_purchased` (`product`). `docs/store/privacy-labels.md` lists them.

## 4. Hosting and static output

### Cloudflare Pages

- `.github/workflows/deploy.yml` keeps checkout, Node, `npm ci`, and `npm run build`, and replaces `upload-pages-artifact` and `deploy-pages` with `cloudflare/wrangler-action@v4` running `pages deploy dist --project-name=syntactical`, authenticated by the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. The `pages` and `id-token` permissions and the `github-pages` environment go.
- `scripts/copySpaFallback.mjs` and `scripts/writeRouteEntries.mjs` are replaced by `scripts/writeHostFiles.mjs`, which writes `_headers` (long cache for hashed bank files under `content/`, no cache for `manifest.json`) and `404.html` from the not-found route. `.nojekyll` goes.
- The build step receives the web build's public keys (`POSTHOG_KEY`, `POSTHOG_HOST`, `REVENUECAT_WEB_BILLING_KEY`, `ETHICALADS_PUBLISHER`) from repository variables.
- Cutover order, so the site, the mobile content host, and the store-required legal pages never go dark: record the current apex DNS records; add `syntactical.dev` as the Pages project's custom domain (the zone is already on Cloudflare); verify the site is served by Cloudflare; only then remove the GitHub Pages custom domain. GitHub Pages stays enabled for 14 days, and `server/DEPLOY.md` documents the rollback. `ALLOWED_ORIGINS` on the API is unchanged because the origin is unchanged.

### Static output

- `app.config.ts` sets `web.output: 'static'` and adds `app/+html.tsx` for the document shell (charset, viewport, theme colour, the EthicalAds script when configured).
- `app/[language]/index.tsx`, `app/[language]/[difficulty]/index.tsx`, `length.tsx`, and `play.tsx` export `generateStaticParams` built from `BUNDLED_MANIFEST` (12 tracks by 3 difficulties). Query-param routes render with empty params and hydrate.
- Hydration: `ContentProvider` renders the bundled manifest and banks until the cache is read, so every static page has a body, and its own `isHydrated` flag is the one signal a route uses before resolving content; routes that depend on the session use the auth provider's `isHydrated`. There is no separate mount flag. Anything that reads AsyncStorage, the session, or `window` at render time renders its loading state on the server and fills in after hydration. `ModalOverlay`, `useModalPanel`, `wrapTab`, and `useKeyboardNav` already guard `document`; the audit of `app/_layout.tsx` found nothing at module scope.

### Crawlable pages (its own slice, after launch)

A static track page per track and per difficulty with the tagline, the topic list, and the list of question `query.title` values, which are written not to give answers away. The text renders always, below the interactive step, before and after hydration: search engines index the page after running its JavaScript. That is 36 pages of real text for search and for a network's review. Per-question explanation pages are a later option.

## 5. Privacy, store, and docs

- `app/privacy.tsx`: purchase history becomes "whether you have Pro and until when"; the "no ads" sentence becomes the sponsored-card description; vendors gain Google AdMob (mobile, non-personalised, no advertising identifier used for tracking; it receives the IP address and may infer an approximate location) and the web ad network or named sponsor; `app/delete-account.tsx` notes what AdMob keeps. The store labels cover every data type in Google's Mobile Ads SDK disclosure. The web half of this text ships with the sponsored card, not after it.
- `docs/store/privacy-labels.md`: Advertising Data collected, not linked, not for tracking; ATT not shown; Play "Ads: yes"; the three new analytics events.
- `docs/store/in-app-purchases.md`: the two Pro products, the App Store subscription group, the Play base plan, the RevenueCat offering.
- `docs/store/listing.md`, `app-review-notes.md`, `device-checklist.md`, `launch-placeholders.md`, `README.md`, `docs/feature-list/features.md`, `docs/user-stories/*`, `docs/lexicon.md`: rewritten in the slice that changes the behaviour they describe.

## 6. Model failover and model updates

Added 2026-10-27 at the owner's request. `POST /v1/ask` and `GET /v1/study-note` call one model through the `ModelProvider` interface (`server/src/clients/modelProvider.ts`), today Claude Haiku 5.5 alone, with the id hard-coded in `server/src/constants/model.ts`.

- **Two providers.** Anthropic (primary by default) and OpenAI through the Responses API (fallback), behind the same interface. `MODEL_PRIMARY` chooses the order. With one key set, that provider runs alone, as today.
- **What fails over.** One classifier decides. A transient failure (timeout, connection, 408, 409, 429, 5xx, or a 400 that does not mark the prompt) or a configuration failure (401, 403, 404) on one provider moves the call to the next. A refusal, a truncated answer, or a 400 that flags the prompt itself (OpenAI's `invalid_prompt` or a content-policy code) resolves `null` and is final: a declined learner message is never sent to the other vendor and opens no breaker.
- **Circuit breaker.** Per process. Three transient failures in a row skip a provider for 60 seconds. One configuration failure skips it for 15 minutes and logs an error naming the provider, the model, and the status, so a retired model or a rejected parameter is visible at once and costs one slow request. When every provider is skipped, the primary is tried anyway.
- **Time budget.** Each attempt gets 11 seconds and SDK retries are off for every provider, so a `retry-after` header cannot stretch a call. The failover makes the single retry itself, on the same provider when it is the only one, and the whole call is bounded at 22 seconds, under the app's 30-second wait.
- **Model ids from the environment.** `ANTHROPIC_MODEL` (default `claude-haiku-5-5`), `OPENAI_MODEL` (required with `OPENAI_API_KEY`, no default), `OPENAI_REASONING_EFFORT` (optional; sent only when set). A model change is a Railway variable change.
- **Model updates.** A smoke script (`npm run model:smoke -w server`) runs the real Ask and study-note prompts through each provider before a model id is changed. Its workflow runs on demand and daily in a `--models-only` mode that checks each configured model through the vendor's Models API and fails on a 404, so a retirement notifies the owner before a learner meets it. Nothing runs inside the server for this. `server/DEPLOY.md` gains the runbook.
- **Logs.** One line per call with provider, model, outcome, latency, and whether the fallback answered. Never the prompt, the learner's message, the answer, or an SDK error object.
- **Privacy.** The processor list in `app/privacy.tsx`, `app/delete-account.tsx`, and `docs/store/privacy-labels.md` names Anthropic, which already receives every Ask question and study-note summary but is missing from the policy on `main` today, and OpenAI as the fallback that receives the same text. The owner confirms OpenAI's current API data-retention terms before the policy ships.
- **Out of scope.** The content pipeline already runs on two vendors with a run-level failure cap and is owner-run, so it is unchanged.

## Owner actions outside the repo

Every one of these is a cutover step. The code is built and tested against fixtures before any of them exist (plan, "Seams and fixtures").

| Item                                                                                                                       | Needed for                                             |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| RevenueCat: the two products, one offering with `$rc_annual` and `$rc_lifetime`, the webhook secret, the three client keys | Sandbox purchase check (area 4)                        |
| App Store Connect: subscription group "Pro" with the annual product; the lifetime non-consumable                           | Sandbox purchase check (area 4)                        |
| Play Console: subscription with a `yearly` base plan; the lifetime in-app product                                          | Sandbox purchase check (area 4)                        |
| Cloudflare: Pages project `syntactical`, API token with Pages edit, account id, custom domain                              | Cutover commit (area 5)                                |
| AdMob: account, iOS and Android app ids, two native ad units per platform (results, tracks), UMP message published         | Real ads after launch (area 6)                         |
| EthicalAds: apply at 50,000 monthly pageviews; publisher id                                                                | After launch                                           |
| OpenAI: API key and the chosen model id                                                                                    | The fallback (area 9)                                  |
| PostHog key                                                                                                                | Before launch, so the audit's decision gates have data |

## Resolved questions

- **Guests and Ask.** Ask stays sign-in only. Usage is counted per user, the free cap is small, and the sign-in prompt is a funnel the audit wants kept.
- **Bundle all 36 banks or only Easy.** Only Easy. The runtime download path already exists and the bundle stays at 2.2 MB.
- **Drop `access` or narrow it.** Drop it, with `productId`, and keep `schemaVersion` at 2; the retired-key rule is the protection.
- **Annual `CANCELLATION`.** Access continues to `expires_at`; `EXPIRATION`, `REFUND`, or a `CUSTOMER_SUPPORT` cancellation (a refund) revokes. The paywall says so. Apple's billing grace period is not modelled: a subscriber in grace may see the free tier until RevenueCat reports the renewal.
- **The test-only webhook.** It is a start option that only the e2e runner passes, refused outside `NODE_ENV=test`, like the server's other test seams; an environment variable alone never mounts it.
- **AdMob ids.** Google's sample ids and test ads in development and preview builds; real ids only in the production environment, where a missing or sample id stops the build. Test mode wins over a configured unit id.
- **Where the house card points.** `ProSheet`, with `source: 'house_card'` on `paywall_viewed`.
- **An annual grant without an expiry.** A grant event on the annual product that carries no `expiration_at_ms` is recorded but grants nothing, and is logged. A missing expiry must never read as Pro forever.
- **Google Play subscription ids.** RevenueCat reports a Play subscription as `syntactical.pro.annual:yearly`. The server and the client both strip the base-plan suffix before matching a Pro product id.
- **Unhandled webhook types.** Answered 200 and not stored, as today; only the grant, revoke, and expiry-only types are recorded.
- **Medium and Hard downloads.** A bank downloads on first use only; the background refresh updates only banks already on the device.
- **Static pages need content.** `ContentProvider` renders the bundled manifest before storage is read, so the static HTML carries a body (plan Task 7.1).
