# Free content, Pro, and sponsored cards: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is written at task level; expand each behavioural task into its RED and GREEN steps when its slice starts, following the conventions in "How to execute this plan".

**Goal:** Every bank free; one Pro tier (annual or lifetime) that removes sponsored cards and raises the Ask limit; sponsored cards in the app's own style on web and mobile; the web app on Cloudflare Pages with static output.

**Architecture:** The content schema loses `access` and `productId` and all 36 banks live under `content/`, bundled (Easy) or downloaded with hash verification (Medium, Hard). The server keeps the RevenueCat webhook and the `entitlements` table, adds `expires_at`, and derives one `pro` status from two products. The app replaces the per-bank paywall with a `ProSheet`, reads `pro` from `/v1/me`, and renders a `SponsoredCard` fed by AdMob native assets on mobile and by EthicalAds, a direct sponsor, or the house card on the web. The web export becomes static HTML per route, deployed to Cloudflare Pages by `wrangler-action`.

**Tech Stack:** TypeScript; Expo 57 / React Native 0.86 / react-native-web (Jest, `@testing-library/react-native`, `@testing-library/react`, `jest-axe`); Express 5 on Railway with Postgres on Neon (Vitest, node-pg-migrate); `@syntactical/content-schema` (Vitest); `pipeline/` (Vitest); RevenueCat (`react-native-purchases`, `@revenuecat/purchases-js`); `react-native-google-mobile-ads` 17.x with `expo-dev-client`; the EthicalAds client; `cloudflare/wrangler-action@v4`; Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-27-free-content-pro-sponsored-design.md`. **Audit:** `docs/audits/2026-10-27-monetization-marketing.md`.

## Global Constraints

- Product ids: `syntactical.pro.annual` (auto-renewing, one year, $19.99 US) and `syntactical.pro.lifetime` (non-consumable, $39.99 US). Both match `PRODUCT_ID_PATTERN` in `constants/appConfig.ts`. No monthly product, ever.
- `hasPro`: a `granted` row for either product with `expires_at IS NULL OR expires_at > now`. `expires_at` is NULL for lifetime and for admin grants.
- Webhook: grant on `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `NON_RENEWING_PURCHASE`; revoke on `EXPIRATION`, `REFUND`; `CANCELLATION` revokes the lifetime product and only writes `expires_at` on the annual; everything else is recorded and ignored. Ordering stays by `event_timestamp_ms`, a revoke wins a tie, idempotency stays on `(provider, provider_event_id)`.
- Ask: `ASK.DAILY_LIMIT = { FREE: 5, PRO: 20 }`; session required; no entitlement gate; the response carries `limit` and `remaining`.
- Profile: `pro: { isActive, expiresAt, product }` replaces `entitlements`.
- Bundled banks: Easy only. Medium and Hard download from `contentBaseUrl` with hash verification and the existing cache.
- Schema: `BankEntry` has no `access` and no `productId`; `schemaVersion` bumps by one.
- `SponsoredCard`: "Sponsored" eyebrow at least 15 points high at the top; headline, one body line, optional icon, one button; no media; never on the question card, in the drawer, mid-round, or in review rounds. Placements: results screen and track list. Cap: `SPONSOR.MIN_ROUNDS_BEFORE_FIRST = 2`, `SPONSOR.ROUNDS_BETWEEN = 3`, both in `constants/appConfig.ts`.
- Mobile ads: non-personalised only (`requestNonPersonalizedAdsOnly: true`); no ATT prompt; UMP consent before the first request in the EEA and UK; AdChoices top-right with that corner kept clear. A missing ad id, no fill, or a load error renders the house card.
- Web ads: EthicalAds text placement with `data-ea-manual="true"`, the `dark flat` classes, `--ea-` custom properties from the app's tokens, no cookies, no consent banner; a direct sponsor from `content/sponsor.json`; the house card otherwise. No AdSense anywhere.
- Analytics events added: `ad_shown`, `ad_clicked` (`placement`, `source`), `pro_purchased` (`product`). No property named `code`, `email`, or `token`.
- Web: `web.output: 'static'`; `generateStaticParams` on every dynamic route from `BUNDLED_MANIFEST`; the deploy is `wrangler pages deploy dist --project-name=syntactical`; the origin stays `https://syntactical.dev`, so `ALLOWED_ORIGINS` and the `SameSite=Lax` cookie are unchanged.
- Lighthouse accessibility stays at 100 on the pages the e2e suite checks; the sponsored card has an accessible name that starts with "Sponsored:".
- No change to progress, stats, review scheduling, or the quiz engine.

## Review Focus

Inputs the spec implies that ordinary tests could miss, most likely first. Each has a test in the owning task.

1. **An annual `EXPIRATION` arriving after a lifetime `NON_RENEWING_PURCHASE` for the same user.** The lifetime row must stay granted and `hasPro` must stay true. Owner: Task 2.3.
2. **A `RENEWAL` with an older `event_timestamp_ms` than an `EXPIRATION` already recorded.** The expiration must win and `expires_at` must not move forward. Owner: Task 2.3.
3. **A free user at the Ask cap who becomes Pro the same day.** The next ask must succeed against the Pro limit without waiting for a new usage date. Owner: Task 2.5.
4. **A Medium bank requested offline with no cached copy, after the Easy bank of the same track played.** The difficulty step shows "Needs a connection to load" and nothing crashes; the previously bundled-free assumption is gone. Owner: Task 1.4.
5. **A manifest that still carries `access` or `productId`.** The validator rejects it with a message naming the key, so a stale pipeline output cannot ship. Owner: Task 1.1.
6. **A sponsored card rendered while `pro.isActive` is unknown (loading).** Nothing renders until the status is `ready`; a Pro user never sees a flash of the card. Owner: Task 5.2.
7. **A native ad that loads after the results screen unmounted.** No state update on an unmounted component, the ad is destroyed, and no `ad_shown` fires. Owner: Task 6.3.
8. **The EEA consent form declined.** The SDK initialises, requests stay non-personalised, and the house card shows if no ad is served; the app never blocks on consent. Owner: Task 6.2.
9. **A static export of `app/[language]/[difficulty]/play.tsx` with empty params at build time.** The page renders its loading state, not the not-found screen, and hydrates to the right bank. Owner: Task 4.3.
10. **A direct sponsor in `content/sponsor.json` whose end date has passed.** The house card shows and the build does not fail. Owner: Task 5.5.

## How to execute this plan

- **Full send.** The work is one ordered list of atomic tasks, executed top to bottom. Task ids are `<area>.<n>`; the areas are only grouping, not a review gate. Each task is one behaviour: one RED test file, a GREEN change to as few files as the behaviour needs, and two commits.
- **Branches exist for CI, not for review.** CI gates per PR (the content drift check, the server integration suites, the oracle runners), so the areas land as eight PRs off `main`, each opened as a draft at its first RED commit and pushed after every GREEN: area 1 `feat/free-banks`, area 2 `feat/unlock-banks`, area 3 `feat/pro-server`, area 4 `feat/pro-app`, area 5 `feat/cloudflare-static`, area 6 `feat/sponsored-card`, area 7 `feat/crawlable-pages`, area 8 `docs/store-rewrite`. Area 1 and area 2 may share one branch if the implementer prefers; nothing else depends on the split.
- **Order:** 1, 2, 3, 4, 5, 6, 7, 8. Area 5 depends only on area 1 and may run in parallel with 2 to 4. Area 6 depends on 4 (`useProStatus`, `ProSheet`) and 5 (`app/+html.tsx`). Area 7 depends on 5. Area 8 runs last.
- **No owner gate on the code.** Every external dependency has a fixture (see "Seams and fixtures"), so owner actions outside the repo gate only the cutover checks, never a task.
- **Test-first, by the book.** Every behavioural task is RED then GREEN: the RED test is written by the model that will not implement it (pick the provider with `~/.claude/enforce/route.sh`; fall back to a fresh-context `test-author` subagent), run against the unchanged code, and committed alone with the failing command and failure line in the commit body. GREEN is by the implementer, who does not edit RED tests (one `DISPUTE` if a test looks wrong). A task with nothing to test (content import, config, docs) says so and gives a verification command with its expected output instead.
- **Review and merge without the owner.** At the end of each PR, one fresh-context `pr-reviewer` subagent reviews the diff against this plan and the spec; the implementer fixes what it finds, and merges on green. The owner does not review PRs. Two PRs are the exception under the repo's rule that security-touching changes are merged by the owner: area 3 (webhook grants and revokes, the test-only webhook route, admin access) and the Cloudflare cutover commit in area 5 (secrets and the domain). Both wait only for the owner's merge click after the reviewer passes.
- RED commit body format:

  ```
  test(<scope>): <behavior>

  RED: <exact command>
  Failure: <first failing assertion or module error line>
  ```

- Commands: content-schema tests `cd packages/content-schema && npx vitest run <path>`; server tests `cd server && npx vitest run <path>` (`TEST_DATABASE_URL` or local Docker for the integration suites); pipeline tests `cd pipeline && npx vitest run <path>` (`SKIP_DOCKER_TESTS=1` where Docker is unavailable); app tests `npx jest <path>`; typechecks `npx tsc --noEmit` (root), `npm run typecheck:workspaces`, `npm run typecheck:e2e`; lint `npm run lint`; content drift `npm run content:build && git diff --exit-code content/manifest.json services/content/*.generated.ts`. Run `npx prettier --write` on every file you create or edit before committing.
- Deletions are listed per task. Delete the test with the code it covers in the same commit; CI runs every `scripts/__tests__` file through root Jest.

---

## Seams and fixtures: build everything first, plug in the real adapters last

The repo already treats every integration as an adapter with a fail-closed stub (`ALLOW_STUBBED_INTEGRATIONS`, `docs/launch-placeholders.md`; a missing client key makes purchases "unavailable" and analytics a no-op). The e2e suite grants entitlements by inserting rows with `source = 'e2e'` straight into `entitlements` (`e2e/specs/paidBank.spec.ts:34`), never through a store. Every slice below builds against these seams, so the only work left when the owner's accounts exist is pasting keys and running the device checks.

| Dependency                                                | Seam                                                                                                                                                              | Fixture used while building                                                                                                                                                                                                                                                                                                                                                                          | Real adapter at the end                                                                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store purchases (RevenueCat on iOS, Android, Web Billing) | `clients/purchaseStoreClient.ts` and `.web.ts` behind `state/usePurchases.ts`; the server sees only webhook events                                                | A `fixturePurchaseClient` selected only when the API base URL is a loopback host (the same guard `app.config.ts` uses for e2e URLs): `buy(productId)` posts a synthetic RevenueCat event to a test-only `POST /v1/test/webhook` route that exists only when `NODE_ENV=test`, so the real webhook, `recomputeEntitlement`, and `/v1/me` run unchanged. Jest uses the existing `purchaseFlowFakes.ts`. | The three RevenueCat keys in EAS and the web build; the offering with two packages. No code change.                                                              |
| Subscription lifecycle (renewal, cancellation, expiry)    | The webhook payload and `hasPro(database, userId, now)` taking `now` as a parameter                                                                               | Integration tests post `RENEWAL`, `CANCELLATION`, `EXPIRATION` with chosen `event_timestamp_ms` and `expiration_at_ms`; `now` is injected, so expiry is tested without waiting                                                                                                                                                                                                                       | RevenueCat sends the same events. No code change.                                                                                                                |
| Pro status for a device check without a store             | `PUT /v1/admin/access` (slice 2)                                                                                                                                  | The admin toggle grants Pro to the owner's account                                                                                                                                                                                                                                                                                                                                                   | Nothing to replace; it stays as the admin path.                                                                                                                  |
| AdMob native ads                                          | `SponsorFeed` interface: `useSponsorContent(placement) -> { status, content, onShown, onClicked }` with `houseFeed`, `fixtureFeed`, `admobFeed`, `ethicalAdsFeed` | Jest: `fixtureFeed` returns deterministic `SponsorContent`. Device: Google's public sample app id and `TestIds.NATIVE`, which serve test native ads with no AdMob account and no approved ad unit. The `NativeAdView` and `NativeAsset` wrappers are built against those test ads.                                                                                                                   | The real app ids and four unit ids in `extra.admob`. No code change; AdMob verifies the app against the store listing and lifts limited ad serving after launch. |
| UMP consent                                               | `state/SponsorProvider.tsx` behind a `ConsentClient` interface                                                                                                    | Jest: a fake consent client with `required`, `obtained`, `declined` states. Device: the SDK's debug geography set to EEA with the device's test id.                                                                                                                                                                                                                                                  | The published UMP message in the AdMob console. No code change.                                                                                                  |
| EthicalAds                                                | `SponsoredCard.web.tsx` reads `window.ethicalads`; the publisher id is optional config                                                                            | Jest: a fake `window.ethicalads` with `load`, `reload`, and a "no ad" callback. Browser: no publisher id, so the house card and the direct sponsor render.                                                                                                                                                                                                                                           | `extra.ethicalAdsPublisher` set once the site qualifies. No code change.                                                                                         |
| Direct sponsor                                            | `content/sponsor.json`                                                                                                                                            | A fixture sponsor with a far-future end date in e2e content                                                                                                                                                                                                                                                                                                                                          | The real file, edited like any content.                                                                                                                          |
| Cloudflare Pages                                          | `wrangler pages dev dist` serves the static export with the same `_headers` and `404.html` semantics as production                                                | Local: `wrangler pages dev`. CI: the deploy step is gated on the secret being present, so the workflow merges before the project exists and GitHub Pages keeps deploying until cutover.                                                                                                                                                                                                              | The project, token, and account id; remove the GitHub Pages steps in the cutover commit.                                                                         |
| Static output                                             | `npm run build` and `npx serve dist`                                                                                                                              | The e2e host serves `dist` as Cloudflare does                                                                                                                                                                                                                                                                                                                                                        | Nothing to replace.                                                                                                                                              |
| Analytics                                                 | `clients/analyticsClient.ts`, a no-op without a key                                                                                                               | Jest asserts events through the existing client mock                                                                                                                                                                                                                                                                                                                                                 | The PostHog key. No code change.                                                                                                                                 |
| Email sign-in                                             | The stubbed email client; e2e reads codes from the test database                                                                                                  | Already in place                                                                                                                                                                                                                                                                                                                                                                                     | The Resend key. No code change.                                                                                                                                  |

What cannot be fixtured and stays for the end: a real store receipt and Apple's review of the subscription group, real ad fill and eCPM, and AdMob's app verification. None of them blocks a line of code.

Dependency changes this makes: slice 3's device checks no longer wait on RevenueCat to prove the flow (the fixture client and the admin toggle do), slice 4 merges before the Cloudflare project exists, and slice 6 is built and device-tested on Google's sample ids before an AdMob account exists. The owner's table in the spec becomes a cutover checklist rather than a gate.

Fixture rule: a fixture adapter is selected only by the same loopback guard the e2e build already uses, or by `NODE_ENV=test` on the server, and never by a flag a production build could carry. `scripts/__tests__` gets one test that fails if a fixture module is reachable from the production import graph.

---

## Slice 1: every bank free (`feat/free-banks`)

Depends on: the private repo `nullvoidundefined/syntactical-content` checked out beside this one for Task 1.2. Nothing outside the repo otherwise.

### Task 1.1: schema without `access` and `productId`

- [ ] RED (content-schema): `validateManifest` rejects an entry carrying `access` or `productId` with a message naming the key; accepts an entry with neither; `supportedSchemaVersion` is the bumped value.
- [ ] GREEN: edit `packages/content-schema/src/types/BankEntry.ts`, `findBankEntryProblem.ts` (remove lines 16-20, add the unknown-key check), `validateManifest.ts` (drop the `productId` argument at 32-33), `supportedSchemaVersion.ts`. Export nothing new.
- [ ] Update the schema package tests that build paid fixtures.

### Task 1.2: import the 24 banks and rebuild the manifest

- [ ] Copy `<track>/medium.json` and `<track>/hard.json` from `../syntactical-content` at the sha in `content/paid-content.ref` into `content/<track>/`. Verify each file's SHA-256 equals the hash the manifest already holds for it before deleting `content/paid-content.ref`.
- [ ] Remove every `access` and `productId` key from `content/manifest.json`; bump `schemaVersion`.
- [ ] RED (scripts, Jest): `buildContentManifest` hashes every bank under `content/` with no root argument, bundles only `easy` banks, and fails on a bank file under `content/` that the manifest does not list.
- [ ] GREEN: `scripts/buildContentManifest.mjs`: remove `contentRoot`, `pickBankDir` (75-77), `assertBanksInTheirTrees` (98-108), the paid branches at 112-125, 180-188, 231-235; keep the `easy`-only bundling as an explicit list. Delete `scripts/assertNoPaidBanks.mjs` and its step in `package.json`. Delete `scripts/__tests__/publicContentTree.test.ts`, `paidContentRef.test.ts`, `noPaidQuestionIds.test.ts`, `buildContentManifestPaidSplit.test.ts`, `buildContentManifestPaidRoot.test.ts`.
- [ ] Run `npm run content:build`; commit the banks, the manifest, and both generated files together.

### Task 1.3: pipeline without a content root

- [ ] RED (pipeline): `publish` writes a changed Medium bank into `content/<track>/medium.json`; `apply-staging` merges references into a Hard bank; `runCli` rejects `--content-root` as an unknown option.
- [ ] GREEN: remove the root from `pipeline/src/cli.ts:38`, `commands/runCli.ts:62-67,107,158`, `commands/publish.ts:8-10,55-61,97`, `commands/enrich.ts` (`--free-only`), `services/content/loadCommandManifest.ts:55-57`, `hasPaidBanks.ts`, `classify/assertContentRootUsable.ts`, `resolveBankFile.ts:12`, `resolveBankOutputRoot.ts:8`. Update `README.md` "Publishing paid banks" and "Rationales and before-answer references" to one flow.

### Task 1.4: app without locked banks

- [ ] RED (Jest): `useQuestionBank` for a Medium bank returns `ready` from a cached download, `loading` while fetching, and `error` with `retry` offline with no cache; it never returns `locked`. `DifficultyStep` shows "Needs a connection to load" for an uncached Medium bank offline. `prefetchChangedBanks` schedules Medium and Hard banks.
- [ ] GREEN: `state/useQuestionBank.ts` (drop 50-59, 68-75, 103 and the `locked` union member), `services/content/loadQuestionBank.ts` (drop 61-89 and the owner cache at 114), `services/content/buildBankQuery.ts` (drop the owner from the key), `services/content/prefetchChangedBanks.ts:24`, delete `state/PaidBankPrefetch.tsx` and `services/content/prefetchPaidBanks.ts` and unmount from `app/_layout.tsx:41`. `app/[language]/index.tsx`: remove the paywall, the `?paywall=` param, and the `useEntitlements` read; `components/menu/DifficultyStep.tsx`: remove `price`, `onSelectLockedDifficulty`, `describeLockedBank`. Delete `state/__tests__/useQuestionBankPaid*.test.tsx` and `app/__tests__/difficultyPaywall*.test.tsx`; update `components/menu/__tests__/menu.test.tsx:10` and `DifficultyStep.test.tsx:51` fixtures.
- [ ] Leave `PaywallSheet`, `usePurchases`, `useEntitlements`, `purchase-complete`, `settings` restore, and `admin` in place; slice 3 rewrites them. Until then `useEntitlements` keeps reading `entitlements` and nothing opens the sheet.

### Task 1.5: server without paid banks

- [ ] RED (server, Vitest): `GET /v1/banks/python/medium` is 404 (route gone); `startServer` boots with no `PAID_CONTENT_DIR`; `readServerQuestions` indexes every bank in the public tree; `POST /v1/ask` for a Medium question by an entitled user answers 200 (the entitlement gate moves in slice 2; here the question lookup must find Medium questions).
- [ ] GREEN: delete `src/routes/banks.ts`, `banksDeps.ts`, `types/PaidBank.ts`, `types/PaidBanks.ts`, `services/readServerBank.ts`, `services/assertPaidDirSeparate.ts`; simplify `readServerQuestions.ts:33-53`, `readServerManifest.ts:9`, `readBankBytes.ts:12-30`, `types/QuestionIndex.ts:2`; remove `PAID_CONTENT_DIR` from `config/env.ts:35-40,81`; remove the banks mount in `app.ts:53-54,150-153`; in `startServer.ts:96-163` derive `paidProductIds` from a temporary constant of the 24 ids so the webhook keeps compiling until slice 2. Delete the tests listed under "Delete" in the server map (`routes/banks*.integration.test.ts`, `services/readServerBank*.test.ts`, `readServerManifestPaid.test.ts`, `config/envPaidContent.test.ts`, `integration/createBanksTestApp.ts`); adjust `createTestApp.ts`, `createWebhookTestApp.ts`, `startServer.integration.test.ts`, the env tests, `app/hardening.test.ts`, `readServerManifest.test.ts`.

### Task 1.6: deploy scripts and fixtures without private content

- [ ] RED (server scripts tests): `copyContent.mjs` copies a manifest with no paid banks; `deployToRailway.sh` runs without `build/paid-content`.
- [ ] GREEN: `server/scripts/stageBuildContent.sh` (public copy only), delete `fetchPinnedCommit.sh` and `src/__tests__/scripts/fetchPinnedCommit.test.ts`, `copyContent.mjs:40-42`, `Dockerfile:9-11,38-43,49,63-65`, `Dockerfile.dockerignore:21`, `deployToRailway.sh:27,35`; delete `server/ci-fixture/paid/` and move its entry to `ci-fixture/public/manifest.json`; remove `content-deploy-key` from `.github/workflows/server.yml:38-45`, `server-deploy.yml:4-5,59,95-102`, `.github/actions/check-api-image/action.yml:8-35`. Rewrite `server/DEPLOY.md` sections 3, 22-62, 107, 118.
- [ ] e2e: `e2e/support/writeFixtureContent.ts` writes Medium and Hard fixtures as plain banks; `e2e/global-setup.ts:67-103` drops `PAID_CONTENT_DIR`; delete `e2e/specs/paidBank.spec.ts`; rewrite `apiOutage.spec.ts:18-44` to assert a Medium bank plays from cache during an outage; `modalOverlays.spec.ts:17-27` uses a different dialog (sign-out) until slice 3 adds `ProSheet`.
- [ ] Docs in this slice: `README.md` (counts, "Content", "Publishing paid banks"), `docs/feature-list/features.md:39,51-52`, `docs/user-stories/content.md:33`, `docs/user-stories/README.md:10,12`, `docs/launch-placeholders.md` content rows, `docs/session-handoff/session-handoff.md` content line.

---

## Slice 2: Pro on the server (`feat/pro-server`)

Depends on: slice 1 merged.

### Task 2.1: constants and schema

- [ ] GREEN (no behaviour yet): `src/constants/proProducts.ts` exporting `PRO_PRODUCT_IDS = { ANNUAL: 'syntactical.pro.annual', LIFETIME: 'syntactical.pro.lifetime' }`; `revenueCatEvents.ts` with the grant, revoke, and expiry-only sets and `expiration_at_ms` in `PAYLOAD_KEYS`; `revenueCatSchemas.ts` with optional `expiration_at_ms` (non-negative integer); `ask.ts` with `DAILY_LIMIT: { FREE: 5, PRO: 20 }`. Replace the temporary constant from Task 1.5 in `startServer.ts` and `webhookDeps.ts:7`.

### Task 2.2: migration

- [ ] RED (migrations test): after `up`, `entitlements.expires_at` exists, nullable, `timestamptz`; `down` removes it.
- [ ] GREEN: `migrations/<timestamp>_add-entitlement-expiry.js`.

### Task 2.3: webhook grants, revokes, and expiry

- [ ] RED (`revenueCatWebhookEvents.integration.test.ts`): `INITIAL_PURCHASE` on the annual product grants with `expires_at` from `expiration_at_ms`; `RENEWAL` moves it forward; `CANCELLATION` keeps `granted` and keeps `expires_at`; `EXPIRATION` revokes; `REFUND` revokes either product; `NON_RENEWING_PURCHASE` on the lifetime product grants with NULL expiry; `CANCELLATION` on the lifetime product revokes; `BILLING_ISSUE` is recorded and changes nothing; an unknown product id is ignored with 200. Review Focus 1 and 2 as named cases.
- [ ] GREEN: `services/recomputeEntitlement.ts` (carry the latest event's expiry; the expiry-only type updates `expires_at` without changing status), `services/recordPurchaseEvent.ts` (Pro ids, `expiration_at_ms` through the allowlist), `routes/revenueCatWebhook.ts:31-34,79-81`. Update `revenueCatWebhookOrdering`, `Guards`, `Resilience`, `Hardening`, `Auth` integration tests for the new ids.

### Task 2.4: `hasPro` and the profile

- [ ] RED (`hasPro.integration.test.ts`, `me.integration.test.ts:120-167`): `hasPro` is true for a lifetime grant, true for an annual grant in the future, false for an expired annual, false for a revoked row, true for an admin grant; `GET /v1/me` returns `pro: { isActive, expiresAt, product }` and no `entitlements` key.
- [ ] GREEN: `services/hasPro.ts` replacing `hasEntitlement.ts` and `hasAnyEntitlement.ts`; `types/Profile.ts:5`; `services/readProfile.ts:34-40,43-72`. Delete `hasEntitlement.integration.test.ts`.

### Task 2.5: Ask by tier

- [ ] RED (`ask.integration.test.ts`): a signed-in free user gets 5 answers and 429 on the sixth with `limit: 5`; a Pro user gets 20; a guest gets 401; a question from a Hard bank needs no entitlement; Review Focus 3 (a user at the free cap who gains Pro gets the sixth answer).
- [ ] GREEN: `routes/ask.ts:72-79,85,102` (drop the gate, pick the limit by `hasPro`, add `limit` to the response), `routes/askDeps.ts:13` (drop `paidBanks`), `errors.ts:22-23` if unused. `docs/user-stories/quiz.md:125-128`.

### Task 2.6: admin as a Pro toggle

- [ ] RED (`adminAccess*.integration.test.ts`, `setAdminAccessLock.integration.test.ts`): `PUT /v1/admin/access { isGranted: true }` grants an `admin`-source lifetime row with NULL expiry; `false` revokes it; a `revenuecat` grant is never overwritten; `GET` returns one entry `{ product: 'syntactical.pro.lifetime', source }`.
- [ ] GREEN: `routes/adminAccess.ts:24-66`, `schemas/adminSchemas.ts:5-13`, `routes/adminDeps.ts:8`, `services/setAdminAccess.ts:22-70`, `listAdminAccess.ts:8-21`, `toAdminProductEntry.ts`, `types/AdminProductEntry.ts`; `integration/adminAccessRequests.ts`, `createAdminTestApp.ts`.
- [ ] Adjust `deleteMe.integration.test.ts:42,131-147,249-252` and `migrations.test.ts` for the new column and ids. Rewrite `server/DEPLOY.md` webhook section and `docs/launch-placeholders.md` RevenueCat rows for two products.

---

## Slice 3: Pro in the app (`feat/pro-app`)

Depends on: slice 2 merged. Built and e2e-tested against the fixture purchase client and the admin toggle; the RevenueCat offering, the App Store subscription group, the Play base plan, and the three client keys are needed only for the sandbox device check at cutover.

### Task 3.1: `useProStatus`

- [ ] RED (Jest): `useProStatus` returns `guest`, `loading`, `error`, `ready { isPro, expiresAt, product }` from `data.pro`; it shares the `['me', userId, ...]` key root so `useAdminAccess`'s invalidation refetches it.
- [ ] GREEN: rename and rewrite `state/useEntitlements.ts`; update `state/useProfile.ts`, `state/useAdminAccess.ts:73`.

### Task 3.2: `ProSheet`

- [ ] RED (Jest, native and web): the sheet has one `h1` "Syntactical Pro", two benefit lines, a button "A year for {price}" and a button "Forever for {price}" with the store prices, "Not now"; prices absent renders "A year" and "Forever"; it fires `paywall_viewed` once with `source`; Escape closes on web; focus wraps; quiz keys are inert (the existing `PaywallSheet` tests, moved).
- [ ] GREEN: rename `components/purchase/PaywallSheet.tsx` to `ProSheet.tsx` with `{ prices, source, isBuying, message, onBuy(productId), onClose }`; update `components/purchase/__tests__/purchaseFlowFakes.ts`.

### Task 3.3: purchase, confirm, restore

- [ ] RED (Jest): `usePurchases.buy('syntactical.pro.annual')` calls the store client with that id; `confirm` resolves `true` when `/me` reports `pro.isActive`; `pro_purchased` fires with `product: 'annual'`; `purchase-complete` shows "You're Pro" and routes home; Settings shows "Go Pro" for a free user, "Pro until {date}" for an annual, "Pro, lifetime" for a lifetime, and "Manage subscription" on native for an annual; "Restore purchases" stays native-only. Update `app/__tests__/purchaseComplete*.test.tsx`, `settingsRestore*.test.tsx`, `state/__tests__/usePurchasesConfirmAbort.test.tsx`.
- [ ] GREEN: `state/usePurchases.ts:69-70`, `app/purchase-complete.tsx`, `app/settings.tsx` (a `ProRow` component that opens `ProSheet` or the store's subscription management URL), `constants/analyticsEvents.ts` (`pro_purchased`), `clients/analyticsClient` tests.

### Task 3.4: Ask copy and gating

- [ ] RED (Jest): `useCanAsk` is true when signed in regardless of Pro; `AskPanel` shows "N of 5 left today" for free and "N of 20" for Pro from the response's `limit`; at the limit a free user sees the Pro suggestion with a button that opens `ProSheet` with `source: 'ask_limit'`; a 403 is no longer mapped to `locked`.
- [ ] GREEN: `state/useCanAsk.ts`, `components/query/AskPanel.tsx:14-19,89-91`, `services/ask/requestAskAnswer.ts:41-44`, `services/ask/types/AskResult.ts`; tests `AskPanel.test.tsx`, `requestAskAnswer.test.ts`, `quizRoundAsk.test.tsx`.

### Task 3.5: admin toggle in the app

- [ ] RED (Jest): the admin route shows one switch "Pro (admin grant)"; a store purchase shows as "Pro (purchased)" and the switch is disabled.
- [ ] GREEN: `app/admin.tsx`, `state/useAdminAccess.ts`, `services/admin/describeProduct.ts`, `services/admin/parseAccessEntry.ts`; tests `adminRoute*.test.tsx`, `adminAccessTestSupport.ts`.

### Task 3.6: fixture purchase client, e2e, and docs

- [ ] RED (Jest and server): `fixturePurchaseClient` is selected only when the API base URL is a loopback host and posts a synthetic `INITIAL_PURCHASE` or `NON_RENEWING_PURCHASE` to `POST /v1/test/webhook`; that route exists only under `NODE_ENV=test` and forwards to the real webhook handler; a production import graph never reaches the fixture module.
- [ ] GREEN: `clients/purchaseStoreClient.fixture.ts` chosen in `state/usePurchases.ts` by the loopback guard; `server/src/routes/testWebhook.ts` mounted in `app.ts` under the test flag; `scripts/__tests__/noFixtureInProduction.test.ts`.
- [ ] e2e: `e2e/specs/proPurchase.spec.ts` (sign in, open Pro from Settings, buy the annual through the fixture client, the sheet closes, Settings shows "Pro until", the Ask limit reads 20), `modalOverlays.spec.ts` back on the Pro dialog.
- [ ] Docs: `docs/store/in-app-purchases.md` rewritten for the two products (subscription group, base plan, offering, review notes), `docs/feature-list/features.md` "Accounts and purchases", `docs/launch-placeholders.md` client-key rows, `docs/device-checklist.md:31-47`.

---

## Slice 4: Cloudflare Pages and static output (`feat/cloudflare-static`)

Depends on: nothing in slices 2 and 3. The workflow merges with the Cloudflare step gated on the secret being present and the GitHub Pages steps still in place; the cutover commit, once the project, token, account id, and custom domain exist, removes the Pages steps.

### Task 4.1: host files

- [ ] RED (scripts, Jest): `writeHostFiles` writes `dist/_headers` with `Cache-Control: public, max-age=31536000, immutable` for `/content/*/*.json` and `no-cache` for `/content/manifest.json`, and `dist/404.html` from the not-found route; it writes no `.nojekyll` and no per-route `index.html` copies.
- [ ] GREEN: `scripts/writeHostFiles.mjs` replacing `copySpaFallback.mjs` and `writeRouteEntries.mjs`; `package.json` build script; delete their tests and `e2e/support/startWebHost.ts:1-3`'s Pages fallback in favour of serving `dist` as Cloudflare does (static file, then `404.html`).

### Task 4.2: deploy workflow

- [ ] GREEN: `.github/workflows/deploy.yml`: keep build steps; replace the artifact and deploy steps with `cloudflare/wrangler-action@v4` (pinned to a SHA like the other actions), `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`, `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`, `command: pages deploy dist --project-name=syntactical`; permissions `contents: read`, `deployments: write`; concurrency group `cloudflare-pages`. Remove the `github-pages` environment. Document the owner steps in `server/DEPLOY.md:122` and `README.md:85`: create the project, add the custom domain, remove the GitHub Pages domain, then run the workflow once by hand.

### Task 4.3: static output

- [ ] RED (Jest, web): each dynamic route module exports `generateStaticParams` returning every `{ language }` or `{ language, difficulty }` pair in `BUNDLED_MANIFEST` (36 for the difficulty routes); `app/+html.tsx` renders charset, viewport, `theme-color`, and the EthicalAds script tag only when `ethicalAdsPublisher` is configured; `play.tsx` rendered with empty params shows its loading state (Review Focus 9).
- [ ] GREEN: `app.config.ts` `web.output: 'static'`; `app/+html.tsx`; `generateStaticParams` in `app/[language]/index.tsx`, `app/[language]/[difficulty]/index.tsx`, `length.tsx`, `play.tsx`; a `useIsHydrated` hook used by the stats panel, the sign-in state, and the sponsored card so the server render shows loading states.
- [ ] Verify: `npm run build` produces one `index.html` per route under `dist/`; `npx serve dist` plus the e2e `guestRound`, `keyboardNavigation`, `appBarLayout`, and `accountDeletion` specs pass; Lighthouse accessibility 100 on `/` and `/python`.

---

## Slice 5: the sponsored card with house and web feeds (`feat/sponsored-card`)

Depends on: slices 3 and 4 merged. No owner action needed; the EthicalAds publisher id can arrive later.

### Task 5.1: `SponsorContent` and the house card

- [ ] GREEN: `services/sponsor/types/SponsorContent.ts`; `constants/sponsor.ts` with `HOUSE_CARD` and `SPONSOR = { MIN_ROUNDS_BEFORE_FIRST: 2, ROUNDS_BETWEEN: 3 }` re-exported from `appConfig.ts`; `constants/analyticsEvents.ts` gains `ad_shown` and `ad_clicked`.

### Task 5.2: `SponsoredCard` base and placement rules

- [ ] RED (Jest, native and web): the card renders the "Sponsored" eyebrow first, the headline as the accessible name prefixed "Sponsored:", one body line, and one button; it renders nothing while `useProStatus` is `loading` (Review Focus 6) and nothing for a Pro user; on press it fires `ad_clicked` with `placement` and `source`; on first paint it fires `ad_shown` once; the house card's button opens `ProSheet` with `source: 'house_card'`; `jest-axe` passes.
- [ ] GREEN: `components/sponsor/SponsoredCardFrame.tsx` (shared layout), `components/sponsor/SponsoredCard.tsx` rendering the house card (the AdMob feed lands in slice 6), `components/sponsor/useSponsorContent.ts`.

### Task 5.3: results screen and track list

- [ ] RED (Jest): the results screen shows the card only when completed rounds on the device are at least 2 and at least 3 rounds have passed since the last card (counters in AsyncStorage); the track list shows it between the category groups and the number keys skip it; a review round's results show no card.
- [ ] GREEN: `services/sponsor/sponsorCadence.ts` with the counters, `components/quiz/ResultsScreen.tsx:33-41`, `components/menu/LanguageStep.tsx:39-58` (keep 29-35 unchanged), `components/quiz/QuizRound.tsx:220` passing `kind`.

### Task 5.4: web feed

- [ ] RED (Jest, web): with `ethicalAdsPublisher` configured, `SponsoredCard.web.tsx` renders the placement div with `data-ea-publisher`, `data-ea-type="text"`, `data-ea-manual="true"`, classes `dark flat`, calls `window.ethicalads.load()` on mount and `reload()` on route change, and renders the house card when the client is absent or reports no ad; the `--ea-` properties are set from the theme tokens.
- [ ] GREEN: `components/sponsor/SponsoredCard.web.tsx`, `app.config.ts` `extra.ethicalAdsPublisher` (validated as a slug), `global.css` `--ea-` overrides, `jest.config.js` web project includes the new `.web.test.tsx`.

### Task 5.5: direct sponsor file

- [ ] RED (scripts, Jest): `content/sponsor.json` validates `{ headline, body, href (https), iconPath?, startsOn, endsOn }`; an expired entry is skipped at runtime (Review Focus 10); the content build copies it; a malformed file fails the build.
- [ ] GREEN: `packages/content-schema/src/validateSponsor.ts`, `scripts/buildContentManifest.mjs` validation step, `services/sponsor/loadDirectSponsor.ts` (fetch from `contentBaseUrl`, cache like a bank, no hash needed since it carries no questions).
- [ ] Docs: `docs/feature-list/features.md` gains "Sponsored cards"; `docs/lexicon.md` gains "sponsored card", "house card", "direct sponsor".

---

## Slice 6: AdMob native on mobile (`feat/admob-native`)

Depends on: slice 5 merged. Built and device-tested on Google's sample app id and `TestIds.NATIVE` with the SDK's debug geography; the real app ids, four native ad unit ids, and the published UMP message are pasted at cutover.

### Task 6.1: SDK, plugin, and config

- [ ] GREEN: add `react-native-google-mobile-ads` and `expo-dev-client`; `app.config.ts` plugins gain the ads plugin with `androidAppId`, `iosAppId`, `skAdNetworkItems` (the plugin's default list), and `delayAppMeasurementInit: true`; `extra.admob` with `{ resultsAdUnitId, tracksAdUnitId }` per platform, validated with a `ca-app-pub-` prefix; EAS `preview` and `production` profiles name the variables. `docs/launch-placeholders.md` gains the rows.

### Task 6.2: consent and initialisation

- [ ] RED (Jest, native, mocked SDK): `SponsorProvider` requests consent info on first launch, shows the form when required, initialises the SDK afterwards whether consent was given or declined (Review Focus 8), exposes `isReady`, and skips everything for a Pro user; Settings shows "Privacy settings" only when the SDK reports privacy options are required.
- [ ] GREEN: `state/SponsorProvider.tsx` mounted inside `AuthProvider` in `app/_layout.tsx`; `app/settings.tsx` row.

### Task 6.3: native ad rendering

- [ ] RED (Jest, native, mocked SDK): `SponsoredCard.tsx` loads a native ad with `requestNonPersonalizedAdsOnly: true` and `adChoicesPlacement: TOP_RIGHT`, renders headline, body, icon, and call to action each inside a `NativeAsset` of the matching type with no touchable wrapper, keeps the top-right corner clear, renders the house card on no fill or error, destroys the ad on unmount, and fires `ad_shown` only after the ad is displayed (Review Focus 7).
- [ ] GREEN: `components/sponsor/SponsoredCard.tsx` using `useNativeAd`, `NativeAdView`, `NativeAsset`, `NativeAssetType`; `TestIds.NATIVE` in development builds.

### Task 6.4: device checks and store docs

- [ ] `docs/device-checklist.md`: a card on the results screen after the third round with a test ad; the house card on airplane mode; the consent form with a simulated EEA debug geography; the card absent after a sandbox Pro purchase; no ATT prompt at any point.
- [ ] `docs/store/privacy-labels.md`: Advertising Data (collected, not linked, not for tracking), Device ID row confirmed against the AdMob disclosure, Play "Ads: yes", the three new events; `app/privacy.tsx` and `app/delete-account.tsx` vendor and data lines.

---

## Slice 7: crawlable pages (`feat/crawlable-pages`)

Depends on: slice 4 merged. After launch; not a gate for anything above.

### Task 7.1: track and difficulty text pages

- [ ] RED (Jest, web): the static render of `app/[language]/index.tsx` contains the tagline, the topic list, and the three bank sizes; the static render of `app/[language]/[difficulty]/index.tsx` lists every question's `query.title` for that bank as plain text under a heading, in document order, with no answers, explanations, or choices.
- [ ] GREEN: a `TrackSummary` and a `BankTitles` component rendered only in the static build (gated on `useIsHydrated` being false or on a build-time flag) so the interactive UI is unchanged after hydration; titles are read from the bank files at build time through `generateStaticParams`'s data path.
- [ ] Verify with `curl` on the deployed pages that the text is in the HTML, then submit the sitemap. `scripts/writeHostFiles.mjs` gains `sitemap.xml` and `robots.txt`.

---

## Slice 8: store and legal rewrite (`docs/store-rewrite`)

Depends on: slice 6 merged. Pure docs.

- [ ] `docs/store/listing.md`: "Every bank is free. Pro removes sponsored cards and raises the Ask limit"; counts; What's New.
- [ ] `docs/store/app-review-notes.md`: how to reach Pro, where the sponsored cards appear, the test ad note, no ATT.
- [ ] `docs/store/in-app-purchases.md`: final check against the configured products.
- [ ] `docs/launch-placeholders.md`: every row reconciled with what is set.
- [ ] `docs/session-handoff/session-handoff.md`: the new state.
- [ ] `docs/audits/2026-10-27-monetization-marketing.md`: a "Shipped" note at the top pointing at this plan.

## Resolved ambiguities

- **Ask for guests:** sign-in stays required (spec, "Resolved questions").
- **Where the temporary 24-id constant from Task 1.5 goes:** it is deleted in Task 2.1; it exists only so slice 1 compiles on its own.
- **Web `ProSheet` without Web Billing keys:** the sheet shows "Buy on the mobile app" copy when `prices` is empty on the web, matching the existing "Purchases unavailable" behaviour.
- **Lighthouse and the EthicalAds script:** the script is deferred and only injected when a publisher id exists, so the accessibility and performance checks run without it until then.
