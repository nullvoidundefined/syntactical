# Syntactical v2: verified content pipeline, accounts, progression, and paid banks

**Ticket:** IAN-601
**Source:** Notion "Syntactical v2 Spec" (https://app.notion.com/p/3ede1531171b81a0b65fd7541f084171), grounded against this repo on 2026-10-02
**Status:** approved by the owner at Gate 1 (2026-10-02)
**Date:** 2026-10-02

## Goal

Syntactical v2 adds AI as a build-time content pipeline, plus accounts, progression, analytics, and paid banks. The app stays static-first and offline-first, and no user action ever triggers a model call. Every question in the library is checked by executing code, every wrong answer explains why it was tempting, the quiz becomes a daily learning loop (day streak, XP, daily goal, spaced review), progress syncs across web, iOS, and Android, and the Medium and Hard banks for each language sell once for $5 on all three platforms. Content stays at 9 banks of about 100 questions.

## Owner decisions

Locked in Notion (2026-10-02), restated here so the spec stands alone:

1. Audience: working developers self-studying on web, iOS, and Android. Employer skill checks are parked.
2. AI runs at build time only. Runtime AI (chat, paste-your-code) is shelved.
3. Content model: 9 banks (language by difficulty), about 100 questions each, divided into about 10 topics of about 10 questions.
4. Free: the Easy bank of each language. Paid: the Medium and Hard bank of each language, $5 each, one-time, 6 products, no subscription.
5. Question types: multiple choice, true/false, and A/B "which is optimal?" with a stated criterion.
6. Progression: day streak, XP, daily goal, spaced review. No leagues, hearts, or achievements.
7. Guests play free content with local progress; an account adds sync and purchases; guest progress merges on first sign-in.
8. Backend: Express 5 + TypeScript on Railway, Neon Postgres. Auth, progress, and entitlements only.
9. Auth: email one-time code via Resend. Web uses an HttpOnly cookie; native uses a bearer session token in SecureStore; one sessions table.
10. Payments: RevenueCat for all three platforms: App Store and Play through the stores, web through RevenueCat Web Billing (Stripe underneath, connected in RevenueCat). Gate 1 choice, 2026-10-02.
11. Analytics: PostHog, anonymous and cookieless for guests.
12. Model access through a provider interface: `claude -p` on the owner's subscription for bulk runs, an Anthropic API key for CI and as the fallback.

Decided during grounding (2026-10-02, owner tiles):

13. **Domain.** The owner owns `syntactical.dev`. The web app is served at `https://syntactical.dev` (GitHub Pages with a custom domain) and the API at `https://api.syntactical.dev` (Railway). The two are same-site, so the session cookie is first-party with `SameSite=Lax`. This reverses the earlier non-goal "Accounts, sync of stats across devices, and any server" in `docs/superpowers/specs/2026-10-02-expo-universal-app-design.md`.
14. **Repo layout.** npm workspaces in this repo. The Expo app stays at the root, unchanged in place. New workspace packages: `packages/content-schema` (content types and validators shared by every consumer), `packages/progress` (XP, day streak, daily progress, review scheduler), `server/` (Express API), and `pipeline/` (content pipeline CLI).

15a. **Paid content storage** (owner tile, 2026-10-02). This repo is public, so paid bank sources live in a new private repo, `nullvoidundefined/syntactical-content`. The pipeline publishes paid banks there; the server's build and this repo's CI check it out with a read-only deploy key (`CONTENT_DEPLOY_KEY`). Free banks stay in this repo. The current Medium and Hard text remains in public git history; v2's paid value is the audited, enriched versions.

Proposed during grounding, settled by approving this spec (each resolves a conflict listed below):

15. Keep the question discriminator `question.type` and the value `'bool'`; add `'ab'`. The Notion spec's `kind` and `tf` are dropped (247 `bool` entries, the cache re-validation path, and about 13 test files depend on the current names).
16. A free or paid bank is described by `access: 'free' | 'paid'` on the bank entry, not `tier` (the lexicon reserves `tier` as a forbidden synonym for difficulty).
17. A choice's "why it was tempting" text is `choice.rationale`, not `explanation`, because `query.explanation` already owns that word.
18. The existing consecutive-correct-answers counter is renamed the **answer streak**; the new consecutive-days counter is the **day streak**. Both are shown; only the day streak syncs and drives the daily loop.
19. A spaced-repetition pass is a **review round**, not a "review session"; `session` means only a sign-in session.
20. Paid banks are returned by an entitlement-checked API endpoint that streams the stored file bytes verbatim (`Content-Type: application/json`), so the client's hash check passes; this is a recorded exception to the `{ data }` response envelope. No object store and no signed URL: a $5 bank does not justify the extra moving part, and the owner declined DRM.
21. Sessions follow the owner's stack convention (custom sessions table, SHA-256 hashed opaque tokens), not `express-session`/`connect-pg-simple`, because one table must serve both the cookie and the bearer transport.
22. New client components follow this repo's domain-grouped layout (`components/<domain>/<Component>.tsx`), not one folder per component.
23. Answer timestamps are trusted from the device within bounds (not more than 24 hours in the future, not before the user's `created_at` minus 365 days). A learner can backdate their own day streak with a wrong clock; with no leaderboards that harms nobody, and rejecting backdated events would also reject legitimate offline play. The spec states this limit instead of claiming to prevent it.
24. The server derives `isCorrect` from `choiceIndex` against the bank's answer and whether an answer was a due review by replaying the shared scheduler, so neither is a client claim; `roundKind` is recorded for analytics only.
25. Gate 1 choices (owner tiles, 2026-10-02): web payments through RevenueCat Web Billing, so one RevenueCat webhook serves every platform and the server holds no Stripe code; bulk model runs through `claude -p` on the owner's subscription, the API key path for CI and fallback; the review scheduler is `ts-fsrs` (FSRS), shared by app and server through `packages/progress`.

## Codebase grounding

| Concept in this spec | Real path | Exported name |
|---|---|---|
| Question (mc, bool) | `services/content/types/Question.ts` | `Question` |
| Query (drawer content) | `services/content/types/Query.ts` | `Query` |
| Manifest | `services/content/types/Manifest.ts` | `Manifest` |
| Language entry | `services/content/types/LanguageEntry.ts` | `LanguageEntry` |
| Bank entry | `services/content/types/BankEntry.ts` | `BankEntry` |
| Cached bank | `services/content/types/CachedBank.ts` | `CachedBank` |
| Manifest validation | `services/content/validateManifest.ts` | `validateManifest` |
| Bank and question validation | `services/content/validateQuestionBank.ts` | `validateQuestionBank` |
| Bank path rule | `services/content/isSafeBankPath.ts` | `isSafeBankPath` |
| Content build (hashes, generated bundles) | `scripts/buildContentManifest.mjs` | `buildContentManifest` |
| Bundled banks | `services/content/bundledBanks.generated.ts` | `BUNDLED_BANKS` |
| Bundled manifest | `services/content/bundledManifest.generated.ts` | `BUNDLED_MANIFEST` |
| Content fetch | `clients/fetchContentText.ts` | `fetchContentText` |
| Manifest load | `services/content/loadLanguageManifest.ts` | `loadLanguageManifest` |
| Bank load | `services/content/loadQuestionBank.ts` | `loadQuestionBank` |
| Bank hash check | `services/content/verifyBankHash.ts` | `verifyBankHash` |
| Bank URL | `services/content/resolveBankUrl.ts` | `resolveBankUrl` |
| Content provider | `state/ContentProvider.tsx` | `ContentProvider` |
| Content base URL pin | `app.config.ts` | `CONTENT_ORIGIN`, `ALLOWED_BASE_URLS` (module constants) |
| Content base URL allowlist | `services/content/validateContentBaseUrl.ts` | `validateContentBaseUrl` |
| Query client | `config/queryClient.ts` | `createQueryClient` |
| Manifest hook | `state/useLanguageManifest.ts` | `useLanguageManifest` |
| Bank hook | `state/useQuestionBank.ts` | `useQuestionBank` |
| Round engine | `state/useQuizEngine.ts` | `useQuizEngine` |
| Shuffle | `services/quiz/shuffleQuestions.ts` | `shuffleQuestions` |
| Answer check | `services/quiz/isAnswerCorrect.ts` | `isAnswerCorrect` |
| Round completion | `state/useRoundCompletion.ts` | `useRoundCompletion` |
| Stats | `services/stats/types/Stats.ts` | `Stats` |
| Round key | `services/stats/types/RoundKey.ts` | `RoundKey` |
| Answer fold (answer streak today) | `services/stats/recordAnswer.ts` | `recordAnswer` |
| Completion fold | `services/stats/recordCompletion.ts` | `recordCompletion` |
| Stored stats check | `services/stats/isStoredStats.ts` | `isStoredStats` |
| Track key | `services/stats/buildStatsKey.ts` | `buildStatsKey` |
| Stats provider | `state/StatsProvider.tsx` | `StatsProvider`, `useQuizStats` |
| Storage and schema constants | `constants/appConfig.ts` | `STORAGE_KEY`, `REJECTED_STORAGE_KEY`, `STORAGE_SCHEMA_VERSION`, `SUPPORTED_SCHEMA_VERSION`, `QUESTION_TYPES`, `KEY_BINDINGS`, `DIFFICULTIES` |
| Query drawer | `components/query/QueryDrawer.tsx` | `QueryDrawer` |
| Round screen body (Explain) | `components/quiz/QuizRound.tsx` | `QuizRound` |
| Cards | `components/quiz/MultipleChoiceCard.tsx` | `MultipleChoiceCard` |
| Boolean card | `components/quiz/BooleanCard.tsx` | `BooleanCard` |
| Card frame | `components/quiz/QuestionCardFrame.tsx` | `QuestionCardFrame` |
| Results | `components/quiz/ResultsScreen.tsx` | `ResultsScreen` |
| Stats panel | `components/stats/StatsPanel.tsx` | `StatsPanel` |
| Header | `components/layout/AppShell.tsx` | `AppShell` |
| Difficulty step | `components/menu/DifficultyStep.tsx` | `DifficultyStep` |
| Routes | `app/index.tsx`, `app/[language]/index.tsx`, `app/[language]/[difficulty].tsx` | `LanguageScreen`, `DifficultyScreen`, `RoundScreen` |
| Keyboard | `state/useKeyboardNav.ts`, `state/useRoundKeyboard.ts` | `useKeyboardNav`, `useRoundKeyboard` |
| Storage clients | `clients/readJson.ts`, `clients/writeJson.ts` | `readJson`, `writeJson` |
| Log client | `clients/logClient.ts` | `logWarning` |
| Hash client | `clients/hashClient.ts` | `hashTextSha256` |
| Online state | `state/useIsOnline.ts` | `useIsOnline` |
| CI | `.github/workflows/ci.yml` | job `check` |
| Deploy | `.github/workflows/deploy.yml` | jobs `build`, `deploy` |
| EAS | `eas.json` | profile `preview` |
| Jest projects | `jest.config.js` | `native`, `web` |
| Lexicon | `docs/lexicon.md` | Domain vocabulary |

Concepts with no match in the repo, which this spec therefore creates: topic, A/B question and criterion, choice rationale, misconception and misconception taxonomy, provenance, oracle, runner, sandbox, model provider, pipeline report, quality page, verified badge, bank access (free or paid), product id, user, sign-in session, one-time code, answer event, day streak, XP, daily goal, daily progress, review round, review state, weakness report, entitlement, purchase event, analytics event, the `server/`, `pipeline/`, `packages/content-schema`, and `packages/progress` workspaces.

## Already exists

- Manifest and bank schema versioning with rejection of unknown versions: implemented at `services/content/validateManifest.ts:63` and `services/content/validateQuestionBank.ts:97`. v2 bumps `SUPPORTED_SCHEMA_VERSION` (`constants/appConfig.ts:27`) rather than adding a second mechanism.
- Content build that validates and rehashes, with a CI staleness check: implemented at `scripts/buildContentManifest.mjs:115` and `.github/workflows/ci.yml:20`. The pipeline's publish stage ends by calling this, not by reimplementing hashing.
- Static hosting with SHA-256 verification, AsyncStorage cache, and bundled fallback for every bank: implemented at `services/content/loadQuestionBank.ts:54` and `state/ContentProvider.tsx:55`. v2 keeps it for free banks and stops bundling paid banks.
- Lifetime stats per language and difficulty, validation of stored stats, and the rejected-stats backup: implemented at `services/stats/isStoredStats.ts:23` and `state/StatsProvider.tsx:48`. The v2 stats migration reuses the backup path.
- Answer streak (consecutive correct answers): implemented at `services/stats/recordAnswer.ts:10`. Renamed, not removed.
- Keyboard bindings for mc and bool: implemented at `constants/appConfig.ts:74`. `A` and `B` already select choices 0 and 1, which is exactly what an A/B card needs, so no new binding is required.
- Offline handling on the difficulty step: partially implemented at `components/menu/DifficultyStep.tsx:37`. Gap: it keys on load status, not on "has a local copy", which matters once paid banks are not bundled.
- One explanation per question: partially implemented at `components/query/QueryDrawer.tsx:15`. Gap: no per-choice text; choices are plain strings (`services/content/types/Question.ts:7`).
- Aggregated answer recording: partially implemented at `services/stats/recordAnswer.ts:8`. Gap: no event log, so there is nothing to sync idempotently.

## Conflicts with current patterns

- The Notion spec adds a server, accounts, and sync; the approved v1 design rejected all three at `docs/superpowers/specs/2026-10-02-expo-universal-app-design.md:16` (R-110: owner decision recorded as decision 13 above, so the reversal is explicit).
- Spec puts an Express API and a Node CLI beside the app; the app package is CommonJS at `jest.config.js:15` while the backend and migration conventions require ESM, and `app/` is Expo Router's routes directory at `app/_layout.tsx:26`, colliding with the backend's `app/*` alias (R-304: resolved by decision 14, separate `server/` and `pipeline/` workspaces with their own `package.json`, `tsconfig.json`, and test runner; the root `tsconfig.json` and `jest.config.js` exclude them).
- Spec's pipeline would validate content itself; the build already imports the app's validators at `scripts/buildContentManifest.mjs:9` (R-303: resolved by moving the content types and validators into `packages/content-schema`, imported by the app, the build script, the pipeline, and the server).
- Spec names the discriminator `kind` with value `tf`; the repo uses `type: 'bool'` at `services/content/types/Question.ts:8` (R-315: resolved by decision 15).
- Spec puts `tier` on the manifest; `docs/lexicon.md:3` forbids `tier` as a difficulty synonym (R-330: resolved by decision 16, `access`).
- Spec adds a per-choice `explanation`; `query.explanation` owns the word at `services/content/validateQuestionBank.ts:31` (R-330: resolved by decision 17, `rationale`).
- Spec's streak is a day streak; `Stats.streak` is an answer streak at `services/stats/recordAnswer.ts:14` (R-330: resolved by decision 18).
- Spec says "review session"; the lexicon chose `round` over `session` at `docs/lexicon.md:6` (R-330: resolved by decision 19).
- Spec stores sessions for cookie and bearer transports in one table; the backend convention prescribes `express-session` with `connect-pg-simple` in `~/.claude/CLAUDE-BACKEND.md` Session Store (R-109: resolved by decision 21; the session design gets the R-109 security review).
- Adding XP, daily progress, and review state to stored stats; only `version === 1` is accepted at `services/stats/isStoredStats.ts:27` (R-204: resolved by an explicit v1-to-v2 stats migration, B-40, instead of letting the rejected-stats path reset users).
- Content `schemaVersion: 2` is ignored by any build that only supports 1 (`constants/appConfig.ts:27`) (R-110: no store build has shipped and the web app deploys with its content, so the client and the content switch to 2 in one PR; recorded so a future v3 plans a compatibility window).
- New components; R-305 asks for one folder per component, the repo groups by domain at `components/quiz/BooleanCard.tsx:1` (R-305: resolved by decision 22, follow the repo).
- `pipeline/` is not in the directory vocabulary and existing content tooling lives in `scripts/` at `scripts/buildContentManifest.mjs:1` (R-304: `pipeline/` is its own workspace package; inside it the standard vocabulary applies: `clients/` for the model provider and Docker, `services/` for stages, `prompts/` for prompt text).
- Tests in `server/` and `pipeline/`; the app uses per-directory `__tests__/` at `services/content/__tests__/validateQuestionBank.test.ts:1` (R-313, R-314: each new package uses one top-level `src/__tests__/` tree mirroring `src/`, with vitest; the app keeps its pattern).
- The content base URL allowlist pins GitHub Pages at `app.config.ts:7` (R-109: moving to `https://syntactical.dev` changes a security control and gets the R-109 review and an insecure-value test per control).

## Domain vocabulary

Every term below is mirrored into `docs/lexicon.md` in the same PR as this spec. Identifier names are the ones the code will use.

- question - one item in a bank, discriminated by `question.type`: `'mc'` (multiple choice), `'bool'` (true/false), or `'ab'` (which of two snippets is optimal) - chosen over: `card`, `item`, and the Notion spec's `kind` because `question.type` already exists in content, validators, and components; `Card` names React components.
- choice - one answer option of an `mc` or `ab` question, `{ text, rationale?, misconceptionId? }` in schema v2 (a plain string in v1) - chosen over: `option`, `answer` because `choices` and `answerIndex` are the existing field names.
- rationale - on a wrong choice, the text explaining what a learner who picked it probably believed and why the runtime disagrees - chosen over: `explanation`, because `query.explanation` already names the question-level text.
- topic - one of about 10 subject groups inside a bank (`operators-and-types`, `numbers-and-math`, `strings`, `iterables`, `data-structures`, `functions-and-scope`, `errors-and-control-flow`, `async-and-concurrency`, `optimization`, `wtf`, plus `security` for Postgres), stored as `question.topic` and listed per language in the manifest - chosen over: `category`, `section`, `chapter` because the owner's spec says topic and the word does not collide with any existing identifier.
- criterion - on an `ab` question, the stated basis for "optimal": `{ type: 'performance' | 'correctness' | 'readability', statement, evidence }` - chosen over: `metric`, `rubric` because readability is not a metric and the rubric is only one of three evidence kinds.
- misconception - a named wrong belief from a closed per-language taxonomy, id `<language>.<kebab-slug>` (for example `python.mutable-default-args`), with a one-line description - chosen over: `mistake`, `error` because `error` names runtime exceptions in question content.
- provenance - per-question record of where content came from and how it was checked: `{ source: 'original' | 'generated', model?, promptVersion?, runtimeVersion?, validation: { method: 'executed' | 'judged', status }, isHumanReviewed }` - chosen over: `metadata`, `audit` because it names the purpose.
- oracle - the code (and optional setup SQL) whose execution output decides a question's answer - chosen over: `check`, `test`, `probe` because "test" collides with the repo's test suites.
- runner - the per-language Docker image plus harness that executes an oracle with no network and fixed CPU, memory, and time limits - chosen over: `sandbox` as an identifier; "sandbox" stays prose for the isolation property.
- model provider - the pipeline's interface over `claude -p` and the Anthropic API key path - chosen over: `llm client`, `ai service` because it is the seam that swaps providers.
- pipeline report - the JSON a pipeline run writes: per-question outcome, rejection reasons, agreement metrics; it feeds the quality page - chosen over: `stats file`, because `stats` names learner stats.
- quality page - the static app route showing current pipeline report numbers - chosen over: `trust page`, `audit page`.
- verified badge - the card label "Output verified on <runtime> <version>", shown only when `provenance.validation.method === 'executed'` and `status === 'passed'` - chosen over: `checkmark`, `trusted`.
- bank access - `bankEntry.access`, `'free'` or `'paid'` - chosen over: `tier` (reserved: the lexicon forbids it as a difficulty synonym) and `plan` (implies a subscription).
- product id - `bankEntry.productId`, the product for a paid bank (`syntactical.<language>.<difficulty>`) - chosen over: `sku`, `price id` because one id maps to App Store, Play, and web billing products through RevenueCat.
- entitlement - a row granting one user one paid bank, whatever the platform it was bought on - chosen over: `purchase`, `license` because a purchase is the event and the entitlement is the resulting right.
- purchase event - one RevenueCat webhook delivery (App Store, Play, or web), keyed by RevenueCat's event id, with email and name fields nulled on account deletion - chosen over: `transaction`, `order`.
- user - an account, identified by email - chosen over: `account`, `member`.
- session - a sign-in session only: an opaque token whose SHA-256 is stored in `sessions`, carried in the `syntactical_session` cookie on web or the `Authorization: Bearer` header on native - chosen over: nothing; reserved so it is never used for a quiz pass (that is a round).
- one-time code - the 6-digit code emailed for sign-in, stored hashed, single use, short-lived - chosen over: `OTP`, `magic code`, `PIN`.
- guest - a learner with no account; progress lives only on the device - chosen over: `anonymous user`, because there is no user row.
- answer event - one answered question, recorded append-only with a client-generated UUID `eventId`, `questionId`, `bankKey`, `choiceIndex`, `isCorrect`, `answeredAt`, `roundKind` - chosen over: `attempt`, `response` because "attempted" already names a stats counter.
- track - the stats record for one language and difficulty pair, keyed by `buildStatsKey` as `language:difficulty` in `stats.tracks` - chosen over: nothing new; it already exists in stored stats, so the lexicon now defines it instead of forbidding it.
- answer streak - consecutive correct answers, reset by a wrong answer (today's `stats.streak`) - chosen over: `streak` alone, which is now ambiguous.
- day streak - consecutive calendar days, in the user's timezone, on which the daily goal was met - chosen over: `streak` alone and `daily streak`.
- XP - points earned per correct answer, scaled by difficulty, with a bonus for due review answers - chosen over: `points`, `score` because `score` reads as one round's result.
- daily goal - the XP target per calendar day, one of 10, 20, or 50 - chosen over: `daily target`, `quota`.
- daily progress - XP earned and goal met for one user on one local date - chosen over: `day stats`.
- review round - a round built from due review items instead of a bank - chosen over: `review session` (session is reserved) and `practice`.
- review state - the per-question and per-misconception `ts-fsrs` card (`due`, `stability`, `difficulty`, `reps`, `lapses`, `state`) rebuilt by replaying answer events - chosen over: `srs card`, `schedule`.
- weakness report - the on-device summary of the most-missed misconceptions over the last 7 days, shown once a minimum sample is reached - chosen over: `insights`, `analytics` (analytics names PostHog events).
- analytics event - one PostHog event from the fixed registry in `constants/analyticsEvents.ts` - chosen over: `metric`, `log`, because logs are the structured warnings in `clients/logClient.ts`.

## Architecture

### Workspaces

```
/                        Expo app (unchanged location): app/ components/ state/ services/ clients/ config/ constants/ scripts/ content/
packages/content-schema/ content types, validators, schema constants, shared by every consumer
packages/progress/       XP, day streak, daily progress, review scheduler (pure functions), shared by app and server
pipeline/                content pipeline CLI (Node 22, TypeScript, ESM, vitest)
server/                  Express 5 API (Node 22, TypeScript, ESM, vitest + supertest, node-pg-migrate)
```

Root `package.json` declares `"workspaces": ["packages/*", "pipeline", "server"]`. The root `tsconfig.json` and `jest.config.js` exclude `pipeline/`, `server/`, and `packages/`. CI runs one job per workspace. `services/content/types/*`, `validateManifest`, `validateQuestionBank`, `isSafeBankPath`, and `SHA256_HEX` move to `packages/content-schema` and are re-imported by the app and `scripts/buildContentManifest.mjs`.

### Content model v2 (schemaVersion 2)

Question:

```ts
type Choice = { text: string; code?: string; rationale?: string; misconceptionId?: string }; // `code` renders as a code block on `ab` cards

type QuestionBase = {
  id: string;
  topic: TopicId;
  prompt: string;
  code?: string;
  query: Query; // unchanged: { title, explanation, syntax?, tags? }
  provenance: Provenance;
};

type Question =
  | (QuestionBase & { type: 'mc'; choices: Choice[]; answerIndex: number })
  | (QuestionBase & { type: 'bool'; answer: boolean; rationale?: string; misconceptionId?: string })
  | (QuestionBase & { type: 'ab'; choices: [Choice, Choice]; answerIndex: 0 | 1; criterion: Criterion });
```

Runtime validation drops a malformed question and keeps the bank (existing behavior, US-CONTENT-004); the build and publish fail on any dropped question. Both validators take a `BankContext` (`{ topicIds, misconceptionIds }`, built from the manifest language entry). Two validators live in `packages/content-schema`. `validateQuestionBank` (client, build script, server) checks shape and references and treats `topic`, `rationale`, and `misconceptionId` as optional, so Stage 1 content (no topics or rationales yet) is valid. `validateBankForPublish` (pipeline `publish` only) adds the publishing rules: every wrong choice of a published `mc` or `ab` question has a `rationale` of at most 280 characters; a published `bool` question has a `rationale` for the wrong value; every `misconceptionId` exists in the language's taxonomy; every `topic` exists in the manifest's topic list for that language.

Manifest language entry adds `topics: { id, label }[]` and `misconceptions: { id, description }[]`. Bank entry becomes `{ path, hash, access: 'free' | 'paid', productId?, contentVersion, topicCounts: Record<TopicId, number> }`. `productId` is required exactly when `access === 'paid'`.

### Delivery

- Free banks: unchanged path. Static host (`https://syntactical.dev/content/...`), hash-checked, cached, bundled.
- Paid banks: not bundled and not on the static host. `GET https://api.syntactical.dev/v1/banks/:language/:difficulty` returns the bank JSON after an entitlement check (401 without a session, 403 without the entitlement). The client verifies the body against the manifest bank hash before caching, exactly as for free banks, so a cached paid bank plays offline.
- Paid bank sources live in the private `syntactical-content` repo, checked out at `../syntactical-content` locally and in CI. `scripts/buildContentManifest.mjs` hashes free banks from `content/` and paid banks from `CONTENT_PRIVATE_DIR`, writes one manifest listing both, bundles only free banks, and fails when a bank with `access: 'paid'` exists under `content/` or the web export contains one.
- The client loads a paid bank through `apiFetch` with credentials and prefetches it only when the user holds its entitlement; the API base URL (`https://api.syntactical.dev/v1/`) is pinned by `validateApiBaseUrl`, the analog of `validateContentBaseUrl`. Paid bank loads keep the `['bank', ...]` query key family so the download indicator still shows.

### Server

Tables (node-pg-migrate, ESM, in `server/migrations/`): `users`, `sessions`, `one_time_codes`, `answer_events`, `daily_progress`, `entitlements`, `purchase_events`. (The Notion spec's `srs_state` table is dropped: review state is replayed from answer events.)

Routes (all under `/v1`, JSON, request id on every log line):

| Method and path | Purpose |
|---|---|
| `POST /auth/codes` | Send a one-time code to an email (rate limited per email and per IP) |
| `POST /auth/sessions` | Exchange email + code for a session; web gets `Set-Cookie`, native gets `{ token }` |
| `DELETE /auth/sessions/current` | Sign out (revoke the session) |
| `GET /me` | User, timezone, daily goal, day streak, XP, entitlements |
| `PATCH /me` | Update timezone and daily goal |
| `POST /answer-events` | Upload a batch of answer events idempotently; returns derived XP, day streak, daily progress |
| `GET /answer-events?after=<cursor>` | Page through the user's answer events so a second device can replay them |
| `GET /banks/:language/:difficulty` | Paid bank body, entitlement-checked |
| `POST /webhooks/revenuecat` | RevenueCat webhook for App Store, Play, and web purchases (authorization header verified) |
| `DELETE /me` | Delete the account: sessions, answer events, daily progress, goal changes, the email's one-time codes and rate-limit counters deleted; entitlements and purchase events kept with `user_id` null for accounting |
| `GET /health` | Liveness, no dependency call (R-345; outside `/v1`) |
| `GET /health/ready` | Readiness, `SELECT 1`, 503 when degraded (outside `/v1`) |

XP, day streak, daily progress, and the review scheduler are pure functions in a shared workspace package, `packages/progress`, used by the app (guests, offline) and the server (signed-in source of truth). Review state is never stored on the server: every device rebuilds it by replaying answer events through the same scheduler, so there is one source of truth.

Middleware follows the backend convention's stack: `helmet`, `cors` (exact origin), `cookie-parser`, `express.json` (10 KB default, 256 KB on `POST /answer-events`), a `csrfGuard` requiring `X-Requested-With: XMLHttpRequest` on every cookie-authenticated non-GET route, zod schemas under `server/src/schemas/`, and `app.set('trust proxy', 1)` for Railway's single proxy hop. `Secure` is set on the cookie everywhere except `NODE_ENV=development`. Sessions expire 30 days after creation or 14 days after last use, whichever is first. Issuing a one-time code invalidates earlier unused codes for that email; hashes are compared with `timingSafeEqual`. `POST /auth/sessions` carries the device's IANA timezone and stores it when the user has none.

State-changing routes also accept only `Content-Type: application/json` (a cross-site form cannot send it without a CORS preflight, which CORS refuses), on top of `SameSite=Lax` and the exact-origin CORS allowlist; the webhook route is exempt and authenticates by its authorization header instead.

One `requireSession` middleware reads the `syntactical_session` cookie or an `Authorization: Bearer` header, hashes the token with SHA-256, and loads the session. CORS allows exactly `https://syntactical.dev` with credentials. Cookies are `HttpOnly; Secure; SameSite=Lax; Path=/`, scoped to `api.syntactical.dev`.

### Client additions

Topic view inside the difficulty step, review round, header with day streak, XP, and daily goal ring, `AbCard`, sign-in screen, purchase flow (RevenueCat Web Billing on web, the store sheet on native), choice rationale first in the query drawer, verified badge, quality page route, weakness report, analytics events, and an on-device answer event log with a sync queue. Review scheduling runs on device so review works offline.

### Pipeline

`pipeline/` CLI stages, each a separate command: `validate`, `classify`, `gap-fill`, `enrich`, `review`, `publish`. Every model call goes through `ModelProvider` (`claude -p` or the Anthropic API) with structured JSON output. Every oracle runs in a runner: `docker run --rm --network none --cpus 1 --memory 256m --memory-swap 256m --pids-limit 64 --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges` with a wall-clock timeout (the Postgres runner adds a tmpfs data directory), three runs, any disagreement rejects. `packages/content-schema` owns `CONTENT_LIMITS`, `DIFFICULTIES`, `GRAMMARS`, and `SUPPORTED_SCHEMA_VERSION` (no import from the app), and builds with `tsc` to `dist/` with an `exports` map; Metro resolves its TypeScript source through `react-native` in its `package.json`. The quality page bundles the committed `pipeline/reports/latest.json`. Every run writes a pipeline report. Nothing reaches `content/` or `server/content/` except through `publish`, which refuses any question without passed validation or recorded human review.

## Acceptance criteria

Order matches the slices in the plan. Each line is one RED slice.

### Stage 0: domain cutover

- B-55: The web export builds with base path `/` for `https://syntactical.dev`, `app.config.ts` pins `CONTENT_ORIGIN` to `https://syntactical.dev`, and `validateContentBaseUrl` accepts exactly `https://syntactical.dev/content/` and rejects the old GitHub Pages URL, `http://`, other hosts, and lookalike hosts.
- B-56: `https://nullvoidundefined.github.io/syntactical/` and its deep links redirect to the same path on `https://syntactical.dev`, so existing links and bookmarks keep working (stats do not carry across origins; the release note says so).

### Stage 1: workspaces, schema v2, audit

- B-1: Root `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass with `packages/content-schema`, `pipeline/`, and `server/` present as workspaces, and the root Jest run collects no test file under those three directories.
- B-2: `packages/content-schema` exports the content types and validators, and the app, `scripts/buildContentManifest.mjs`, the pipeline, and the server all import validation from it; `services/content/validateQuestionBank.ts` no longer exists.
- B-3: The client bank validator `validateQuestionBank` accepts a schema-2 `mc` question whose choices are `{ text, rationale?, misconceptionId? }` objects, with or without `topic`, `rationale`, and `misconceptionId`; the strict publish validator `validateBankForPublish` rejects the same question when any wrong choice lacks a `rationale` or the question lacks a `topic`.
- B-4: Both validators reject a question whose `topic` is present but not in its language's manifest topic list, and one whose `misconceptionId` is present but not in its language's taxonomy.
- B-5: The manifest validator requires `productId` exactly when a bank entry's `access` is `'paid'`, and rejects an `access` value other than `'free'` or `'paid'`.
- B-6: An `ab` question is accepted only with exactly two choices, `answerIndex` 0 or 1, and a `criterion` whose `type` is `performance`, `correctness`, or `readability`.
- B-7: The client renders an existing v1 `mc` question converted to v2 (string choices wrapped as `{ text }`) identically to v1, and `SUPPORTED_SCHEMA_VERSION` is 2.
- B-8: A runner executes a Python, Node, or Postgres oracle with no network access: an oracle that opens a socket records a failure, one that runs past the time limit is killed and recorded as `timeout`, one that allocates past 256 MB is killed, a fork bomb is stopped by the pids limit, a write outside `/tmp` fails, and the process runs as a non-root user.
- B-9: The validator classifies every question in the golden set correctly: each known-correct question passes, each deliberately wrong question fails with reason `answer-mismatch`.
- B-10: An oracle whose output differs across three runs is rejected with reason `nondeterministic`.
- B-11: A question where more than one choice matches the oracle output is rejected with reason `ambiguous`.
- B-12: An oracle that raises is recorded with the exception type as its outcome, so "raises TypeError" questions validate.
- B-13: `pipeline validate` over all 9 banks writes a pipeline report listing every question as `passed`, `failed` (with reason), or `not-executable`, and changes no content file.
- B-14: `ModelProvider` returns parsed structured output from either the `claude -p` path or the API path, and a response that fails the JSON schema raises `ModelOutputInvalid` without retrying more than twice.
- B-15: The quality page renders the counts from the committed `pipeline/reports/latest.json`, including audit failures found in the original banks, and the build fails if a published bank has no report entry.
- B-16: A card whose question has `provenance.validation` `executed` and `passed` shows "Output verified on <runtime> <version>"; any other provenance shows no badge.

### Stage 2: topics and enrichment

- B-17: `pipeline classify` assigns every question one topic from the closed list and routes a call below the confidence threshold to the review queue instead of writing it.
- B-18: Two independent classify runs report their agreement rate in the pipeline report.
- B-19: `pipeline gap-fill` tops up a topic with fewer than 10 questions; a generated question is kept only when its claimed answer matches its executed oracle.
- B-20: `pipeline enrich` writes one `rationale` per wrong choice, conditioned on the recorded oracle output, each at most 280 characters, and a judge that finds a rationale contradicting the oracle output rejects it.
- B-21: `pipeline enrich` tags each wrong choice with a `misconceptionId` from the approved taxonomy and never invents an id outside it.
- B-22: `pipeline publish` refuses to write a question whose validation `failed` (human review does not override a failed oracle), and a `pending` question unless it is human-reviewed, then runs `buildContentManifest` so manifest hashes, topic counts, and content versions update.
- B-23: The difficulty step lists a bank's topics from the manifest with counts, and choosing a topic starts a round of only that topic's questions.
- B-24: After a wrong answer, the query drawer shows the chosen choice's `rationale` first, then the question's `query`.

### Stage 3: accounts, sync, progression, payments

- B-25: `POST /v1/auth/codes` stores only the SHA-256 of a 6-digit code with a 10-minute expiry, sends it through the email client, and returns 202 for any well-formed email, existing or not.
- B-26: `POST /v1/auth/codes` returns 429 after 5 requests per email per hour or 20 per IP per hour.
- B-27: `POST /v1/auth/sessions` creates a session for a correct, unexpired, unused code, marks the code used, and rejects a reused, expired, or wrong code with the same 400 body; 5 wrong codes invalidate the code.
- B-28: A web sign-in response sets `syntactical_session` as `HttpOnly; Secure; SameSite=Lax`; a native sign-in (`X-Client: native`) returns `{ token }` in the body and sets no cookie.
- B-29: `requireSession` accepts a valid cookie or a valid bearer token, rejects an unknown, revoked, or expired token with 401, and stores only the token's SHA-256.
- B-30: CORS allows `https://syntactical.dev` with credentials and rejects every other origin, including `null`; a state-changing request without `Content-Type: application/json` is rejected with 415 (webhooks excepted).
- B-31: `DELETE /v1/auth/sessions/current` revokes the session so the same token then receives 401.
- B-32: `POST /v1/answer-events` inserts each event once by `eventId`; re-uploading the same batch changes no totals.
- B-33: The server derives `isCorrect` from `choiceIndex` against the bank's answer, rejects `choiceIndex` outside the question's choices, and derives XP from stored events (difficulty-scaled), never from a client-sent total.
- B-34: The day streak counts days in the user's stored timezone and counts through yesterday until today's goal is met or the local day ends; an event with `answeredAt` more than 24 hours in the future, or before the user's `created_at` minus 365 days, is rejected (decision 23 states the backdating limit).
- B-35: Daily progress marks the goal met when that day's XP reaches the user's daily goal, and changing the goal to 10, 20, or 50 applies from the current day on.
- B-36: On first sign-in from a device, the guest answer event log uploads in batches of at most 200 and each event is marked synced (kept locally, not cleared), so a 1,000-event guest log syncs completely; a retry after a dropped response double-counts nothing; a second device downloads the events through `GET /v1/answer-events`, replays them, and shows the same day streak, XP, and review queue.
- B-37: `GET /v1/banks/:language/:difficulty` returns 401 without a session, 403 without the entitlement, and the bank JSON (hash matching the manifest) with it; a free bank path returns 404.
- B-38: On web, the app configures RevenueCat Web Billing (`@revenuecat/purchases-js`) with `appUserId = user.id` and buys the product's package; the resulting RevenueCat webhook (store `RC_BILLING`) grants that user the entitlement exactly as a store purchase does; events apply in the provider's event time order, not arrival order, so a refund delivered before its purchase still ends revoked; after checkout the web app polls `/me` until the entitlement appears or 30 seconds pass.
- B-39: After sign-in the app calls `Purchases.logIn(user.id)` (and `logOut` on sign-out), so webhooks carry the server user id; a RevenueCat webhook with a wrong authorization header is rejected; a valid purchase records one purchase event and grants that user the entitlement for the mapped product id; a refund or revocation removes it.
- B-40: Stored v1 stats migrate to v2 on first launch: totals and tracks carry over, `streak` becomes the answer streak, and an empty answer event log and review state are created; a failed migration keeps the v1 value under the backup key.
- B-41: A guest sees a dismissible sign-up prompt after the first completed round, and never again after dismissing it.
- B-42: A paid bank shows a lock and its price (the localized `priceString` from the RevenueCat offering on every platform) on the difficulty step for a user without the entitlement; selecting it opens the purchase flow (RevenueCat Web Billing on web, the store sheet on native).
- B-43: "Restore purchases" on a fresh native install re-grants every entitlement the account holds.
- B-44: A purchased paid bank, once downloaded, plays offline.
- B-45: Each registered analytics event fires once at its trigger (round started, round completed, sign-up prompt shown, sign-up prompt accepted, paywall viewed, purchase completed, review round completed, bank exhausted), guests are tracked without cookies, and no event carries an email or code.

- B-57: Every `KEY_BINDINGS` key is inert while an `input`, `textarea`, or contenteditable element has focus (sign-in email and code fields, on every screen).
- B-58: A choice key beyond the current question's choice count is ignored on every question type.
- B-59: `DELETE /v1/me` deletes the account's sessions, answer events, daily progress, goal changes, and the email's one-time codes and rate-limit counters in one transaction, and keeps entitlement and purchase event rows with `user_id` null for accounting; purchase records store no email or name (the webhook stores an allowlisted scalar projection of each event, never the raw body), so nothing is scrubbed; signing in again with the same email creates a new, empty user; the settings screen offers "Delete account" with a confirmation step.
- B-60: The web export and `bundledBanks.generated.ts` contain no paid bank, and the content build fails when a bank with `access: 'paid'` is found under `content/` or a free bank under the private content directory.
- B-61: Signing out with unsynced events asks to sync or discard them; events recorded under one user are never uploaded under another.
- B-62: `GET /health` returns 200 with no database call; `GET /health/ready` returns 503 when the database is unreachable.
- B-63: A cookie-authenticated non-GET request without `X-Requested-With: XMLHttpRequest` is rejected with 403; a spoofed `X-Forwarded-For` beyond the one trusted proxy hop does not change the rate-limit key.
- B-64: Each new route (sign-in, settings, topic list, review, quality, paywall) has one `h1`, labeled controls, full keyboard operation on web, `animation: none` under reduced motion (the daily goal ring included, exposed as `role="progressbar"` with its value), and scores 100 on Lighthouse accessibility.

### Stage 4: learning loop

- B-46: The review scheduler moves an item's due date further out after a correct review and brings it back within one day after a miss.
- B-47: The review queue is built on device from review state and works offline.
- B-48: Due review answers count toward the daily goal and earn the review bonus, which the server confirms by replaying the shared scheduler over stored events.
- B-49: The weakness report shows a "keep playing" state below 20 answers in the last 7 days, otherwise the top misconceptions by miss rate with their descriptions, and one tap starts a review round of that misconception.

### Stage 5: A/B cards

- B-50: `AbCard` shows the criterion before an answer, both snippets as code blocks, accepts `A`/`B` and `1`/`2` (keys `3`, `4`, `C`, `D` do nothing on it), and reads both snippets to a screen reader with their labels.
- B-51: After answering, the A/B evidence shows the measured benchmark result, the failing edge case, or the rubric reason, matching the criterion type.
- B-52: A performance A/B card is published only when its benchmark gap exceeds the configured ratio on two separate benchmark runs.
- B-53: A readability A/B card is published only with a recorded human approval.

### Stage 6: store release

- B-54: EAS production builds for iOS and Android install, sign in, buy a bank in sandbox, restore it on a second install, and pass `docs/device-checklist.md`.

## Invariants

- No user action triggers a model call; the app and server contain no model provider code.
- Correctness of a published executable question is decided by its oracle's output, never by a model.
- An answer event is counted at most once, whatever the number of uploads.
- XP, day streak, and daily progress on the server are pure functions of stored answer events, the user's timezone, and the daily goal.
- A paid bank body is never served without an entitlement, and never shipped in the bundle or on the static host.
- Free play works with no network once the free banks are bundled or cached.
- Lighthouse accessibility stays at 100 on every route, every feature works with reduced motion and a screen reader.

## Failure modes

- Content fetch or API down: the client keeps playing from cached and bundled banks; the sync queue retries with backoff; paid banks without a cached copy show "Needs a connection".
- Resend down: `POST /auth/codes` returns 503 and logs; the code is not stored as sent.
- Webhook delivered twice or out of order: purchase events are keyed by the provider event id; entitlements are recomputed from the latest event per product.
- Partial batch upload: events are inserted in one transaction; a failed batch inserts none and the client retries the whole batch.
- Concurrent writes for one user: uploads and `PATCH /v1/me` take the user's row lock and run one at a time; a request that hits the 2 s lock timeout or the 5 s statement timeout gets 503 `SERVER_BUSY`, stores nothing, and the client retries.
- Device clock wrong: events more than 24 hours in the future are rejected with 422 and kept locally for a later retry after the clock is fixed; the 24-hour tolerance means a fast clock alone does not strand answers.
- Pipeline runner hangs: killed at the wall-clock limit and recorded `timeout`.
- Model returns malformed JSON: rejected at parse time, retried at most twice, then reported.

## State transitions

- One-time code: `issued` → `used` | `expired` | `exhausted` (5 wrong attempts).
- Session: `active` → `revoked` | `expired`.
- Entitlement: `granted` ↔ `revoked` (refund or chargeback revokes; a later valid purchase re-grants).
- Question in the pipeline: `drafted` → `validated` (`passed` | `failed` | `not-executable`) → `enriched` → `reviewed` → `published`.
- Review state item (FSRS states): `new` → `learning` → `review`, with a miss moving it to `relearning`.

## Non-goals

- Any runtime model call: chat, paste-your-code, generated hints.
- Employer skill checks.
- Subscriptions.
- Leagues, leaderboards, hearts or lives, achievements.
- Generated question variants.
- Growing banks beyond about 100 questions before analytics justify it.
- Social features; languages beyond Python, Postgres, and JavaScript.
- Social login (Apple, Google); revisit with App Store rules if added later.
- Preventing a learner from backdating their own day streak (decision 23).
- DRM or obfuscation of cached paid banks.
- Moving the Expo app into `apps/` or switching to pnpm.

## Dependencies

Reused (R-308): every module in the Codebase grounding table; the content build and CI staleness check; the cache and bundle path; the rejected-stats backup.

New packages, each justified:

- App: `posthog-react-native` (analytics, cookieless mode), `react-native-purchases` (RevenueCat on native), `@revenuecat/purchases-js` (RevenueCat Web Billing), `expo-secure-store` (native session token).
- `packages/progress`: `ts-fsrs` (review scheduler, MIT, no dependencies).
- Server: `express@5`, `pg`, `node-pg-migrate`, `zod` (request schemas, convention), `helmet`, `cors`, `cookie-parser` (convention middleware stack), `resend` (email), `pino` and `pino-http` (logs with request id), `vitest`, `supertest`.
- Pipeline: `@anthropic-ai/sdk` (API provider path), `vitest`. Docker Engine on the owner's machine and in the pipeline CI job.

Accounts and setup the owner provides (Stage 0): Apple Developer, Play Console, Stripe (connected to RevenueCat Web Billing), RevenueCat, PostHog, Resend with SPF and DKIM on `syntactical.dev`, Neon project, Railway project, DNS for `syntactical.dev` and `api.syntactical.dev`.

## Observability

- Server: pino JSON logs, a request id on every line and returned as `X-Request-Id`, no email, code, or token in any log line; `GET /v1/health` checks the database.
- Client: analytics events from `constants/analyticsEvents.ts` only; structured warnings through `logWarning`.
- Pipeline: every run writes a pipeline report under `pipeline/reports/`.

## Security

Security-touching controls, each needing the R-109 review and a test that feeds it its insecure value: one-time code issue and verify (rate limits with the trusted proxy hop, hashing, expiry, attempt cap, prior-code invalidation), session tokens (generation, hashing, revocation, absolute and idle expiry), the cookie attributes, the dual-transport `requireSession`, CORS, the `X-Requested-With` CSRF guard, account deletion, the private content deploy key, the API base URL allowlist, RevenueCat webhook authorization, the paid bank entitlement check, the answer event timestamp bound, the content base URL allowlist change, and the runner sandbox (network, CPU, memory, pids, read-only filesystem, timeout). Never logged: email, one-time code, session token (including the `Set-Cookie` response header), webhook secrets; database errors are logged by code and constraint only. Emails are normalized (trim, NFKC, lowercase) before every key and lookup; one-time codes come from `crypto.randomInt`; attempt and rate counters update atomically under concurrency; the RevenueCat webhook secret is at least 32 characters and compared by digest; the deploy key reaches the server image only as a BuildKit secret mount; account deletion removes the email by value everywhere it appears (one-time codes and the email-keyed rate-limit counters; purchase records never hold it). Content strings stay rendered as React Native `Text`, never markup.

## Assumption ledger

| Claim | Source | Verification command or check | Status | Owner | Next action |
|---|---|---|---|---|---|
| GitHub Pages serves `syntactical.dev` with HTTPS | GitHub Pages docs | Add the custom domain, `curl -I https://syntactical.dev/` | unverified | Ian | Stage 0 DNS |
| `claude -p` structured output is usable for bulk runs under current subscription terms | Notion red team #9 | One 10-question classify run through each provider path | unverified | pipeline slice | Stage 1 |
| RevenueCat webhooks map App Store, Play, and Web Billing products to one product id per bank | RevenueCat docs | Sandbox purchase on each store hits the webhook with the expected product id | unverified | payments slice | Stage 3 |
| Expo SDK 57 runs `posthog-react-native` and `react-native-purchases` in a dev build (not Expo Go) | package docs | EAS dev build launches and logs one event and one offering | unverified | Stage 0 | first real-device build |
| A same-site cookie set by `api.syntactical.dev` is sent on credentialed fetches from `syntactical.dev` in Safari | browser behavior | Safari test against the deployed API | unverified | auth slice | Stage 3 |

## Spec review

- reviewer: Claude subagent (general-purpose), fallback for Codex
- model: claude-fable-5-1
- date: 2026-10-02
- result: 28 findings (5 HIGH, 19 MEDIUM, 4 LOW) and 11 stack options

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | HIGH | Paid banks committed to a public repo | Owner tile: private `syntactical-content` repo (decision 15a, B-60) |
| 2 | HIGH | Stage 1 cannot produce valid v2 banks (topic, provenance) | Fixed: client validator treats topic and rationale as optional; `migrateV1` writes default provenance; strict rules only at publish (B-3, B-4) |
| 3 | HIGH | Review state had no write path | Fixed: review state replayed from answer events with the shared scheduler; `GET /answer-events` (B-36) |
| 4 | HIGH | Global key bindings fire while typing | Fixed: B-57 |
| 5 | HIGH | No account deletion (App Store 5.1.1(v)) and verbatim PII in purchase events | Fixed: `DELETE /me`, B-59 |
| 6 | MEDIUM | CSRF relied on SameSite only | Fixed: `X-Requested-With` guard plus JSON-only bodies (B-30, B-63) |
| 7 | MEDIUM | Health endpoint shape vs R-345 | Fixed: `/health` and `/health/ready` (B-62) |
| 8 | MEDIUM | Paid bank body must be verbatim bytes | Fixed: decision 20 |
| 9 | MEDIUM | Paid bank transport, prefetch, API base URL pin | Fixed: Delivery section, `validateApiBaseUrl` |
| 10 | MEDIUM | Past timestamps can backfill a streak | Accepted limit, stated: decision 23, B-34 bound |
| 11 | MEDIUM | Rate limit behind Railway proxy | Fixed: `trust proxy` 1, B-63 |
| 12 | MEDIUM | Event log growth and clearing contradiction | Fixed: events kept and marked synced, own storage key, 5,000-event cap (plan Task 3.9) |
| 13 | MEDIUM | Sync queue not keyed by user | Fixed: B-61 |
| 14 | MEDIUM | Timezone unknown at first sign-in | Fixed: timezone sent with `POST /auth/sessions` |
| 15 | MEDIUM | Body limit vs guest log size | Fixed: batches of 200, 256 KB limit on that route (B-36) |
| 16 | MEDIUM | Client-asserted isCorrect and review bonus | Fixed: decision 24, B-33, B-48 |
| 17 | MEDIUM | Stripe user mapping, paid status, refunds, disputes, pending state | Fixed: B-38 |
| 18 | MEDIUM | RevenueCat user mapping; hard-coded price | Fixed: B-39, B-42 |
| 19 | MEDIUM | Runner hardening incomplete | Fixed: full flag list, B-8 |
| 20 | MEDIUM | No accessibility criteria for new screens | Fixed: B-64; device checklist rows in Task 6.1 |
| 21 | MEDIUM | Nothing fails if a paid bank is bundled | Fixed: B-60 |
| 22 | MEDIUM | Out-of-range choice keys | Fixed: B-58, B-50 |
| 23 | MEDIUM | Package imports app constants; package build unspecified | Fixed: constants move into the package; `tsc` to `dist/` with `exports` |
| 24 | MEDIUM | Drop vs reject semantics | Fixed: runtime drops, build and publish fail; `BankContext` argument |
| 25 | LOW | Session TTLs, prior codes, timing-safe compare | Fixed: Server section |
| 26 | LOW | Secure in development; middleware stack | Fixed: Server section |
| 27 | LOW | "Today" streak semantics; webhook order | Fixed: B-34, B-38 |
| 28 | LOW | Report path; `ab` choice code | Fixed: B-15, `Choice.code` |

Stack options: keep npm workspaces, Express 5, node-pg-migrate, custom sessions, Resend, PostHog, Docker runners; add `zod`, `helmet`, `cookie-parser` per convention. The three owner options were decided at Gate 1 (decision 25).
